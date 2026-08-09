import { BadRequestException, Injectable } from '@nestjs/common';
import { CashMovementType, CashRegisterStatus, ContractMovementType, ContractType, ItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { DailyCloseQueryDto } from './dto/daily-close-query.dto';
import { RangeReportQueryDto } from './dto/range-report-query.dto';

/**
 * Fin de rango INCLUSIVO, idéntico al de `cash.service.ts` (`endOfRange`):
 * una fecha sin hora (`2026-07-15`) cubre el día entero, no solo las 00:00.
 * Duplicado a propósito — es una función privada de 6 líneas en el otro
 * módulo, no exportada, y no vale la pena crear un acoplamiento entre
 * módulos por esto.
 */
function endOfRange(value: string): Date {
  const parsed = new Date(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  if (isDateOnly) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

function startOfRange(value: string): Date {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  return isDateOnly ? new Date(`${value.trim()}T00:00:00.000Z`) : new Date(value);
}

/** Lista de días calendario (YYYY-MM-DD, UTC) entre dos fechas, ambas incluidas. */
function daysBetween(fromStr: string, toStr: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${fromStr}T00:00:00.000Z`);
  const last = new Date(`${toStr}T00:00:00.000Z`);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const MAX_RANGE_DAYS = 186; // ~6 meses — más que eso, mejor pedirlo por partes.

const DISPONIBLE_STATUSES: ItemStatus[] = [ItemStatus.InStock];
const COMPROMETIDO_STATUSES: ItemStatus[] = [ItemStatus.InPledgeCustody, ItemStatus.OnLayaway];
const EN_PROCESO_STATUSES: ItemStatus[] = [
  ItemStatus.Received,
  ItemStatus.Appraised,
  ItemStatus.InRepair,
  ItemStatus.InTransit,
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cierre del día: consolida en una sola pantalla lo que hoy hay que sumar a
   * mano entre caja, contratos e inventario. Ver docs/12 — motivación del
   * "cuánto vendí/gané hoy".
   */
  async getDailyClose(query: DailyCloseQueryDto, currentUser: AuthenticatedUser) {
    const dateStr = query.date ?? new Date().toISOString().slice(0, 10);
    const from = startOfRange(dateStr);
    const to = endOfRange(dateStr);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('Rango de fecha inválido');
    }

    const branchId = await this.resolveBranchId(query.branchId, currentUser);

    const [
      comprasDelDia,
      ventasDelDia,
      ingresosTotalesDelDia,
      egresosTotalesDelDia,
      gastosDelDia,
      dineroDisponible,
      valorInventarioAlCierre,
      utilidadVentaDelDia,
      utilidadInteresEmpenoDelDia,
      diferenciaCajaPendiente,
    ] = await Promise.all([
      this.comprasDelDia(branchId, from, to),
      this.ventasDelDia(branchId, from, to),
      this.sumCashMovements(branchId, from, to, CashMovementType.CashIn),
      this.sumCashMovements(branchId, from, to, CashMovementType.CashOut),
      this.gastosDelDia(branchId, from, to),
      this.dineroDisponible(branchId),
      this.valorInventarioAlCierre(currentUser.tenantId, branchId),
      this.utilidadVentaDelDia(currentUser.tenantId, branchId, from, to),
      this.utilidadInteresEmpenoDelDia(currentUser.tenantId, branchId, from, to),
      this.diferenciaCajaPendiente(branchId),
    ]);

    return {
      fecha: dateStr,
      branchId,
      comprasDelDia,
      ventasDelDia,
      ingresosTotalesDelDia,
      egresosTotalesDelDia,
      gastosDelDia,
      // Desglosada porque son dos negocios distintos (venta de mostrador vs.
      // sobrecosto de empeño liquidado) — sumarlas a ciegas en un solo número
      // fue justo lo que una auditoría contable marcó como engañoso: el total
      // sigue disponible para quien solo quiera "cuánto gané hoy", pero ahora
      // sí incluye el interés cobrado, no solo la venta directa.
      utilidadVentaDelDia,
      utilidadInteresEmpenoDelDia,
      utilidadEstimadaDelDia: utilidadVentaDelDia + utilidadInteresEmpenoDelDia,
      dineroDisponible,
      // Foto de AHORA, no reconstruida para `dateStr`: el inventario no se
      // versiona por fecha, así que el desglose siempre refleja el estado
      // actual, no el del día consultado.
      valorInventarioAlCierre,
      diferenciaCajaPendiente,
    };
  }

  /**
   * Reporte por rango de fechas — día a día, reutilizando EXACTAMENTE los
   * mismos métodos privados que `getDailyClose` ya usa para un solo día (no
   * hay una segunda implementación paralela del cálculo). `dineroDisponible`
   * y `valorInventarioAlCierre` quedan fuera: son fotos de AHORA, no tienen
   * sentido "por día" hacia atrás — para eso ya está `getDailyClose`.
   */
  async getRangeReport(query: RangeReportQueryDto, currentUser: AuthenticatedUser) {
    if (new Date(query.to).getTime() < new Date(query.from).getTime()) {
      throw new BadRequestException('El rango de fechas es inválido (hasta < desde)');
    }
    const days = daysBetween(query.from, query.to);
    if (days.length > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `El rango pedido cubre ${days.length} días; el máximo por consulta es ${MAX_RANGE_DAYS}. Pídelo en partes más cortas.`,
      );
    }

    const branchId = await this.resolveBranchId(query.branchId, currentUser);

    const rows = await Promise.all(
      days.map(async (dateStr) => {
        const from = startOfRange(dateStr);
        const to = endOfRange(dateStr);
        const [
          comprasDelDia,
          ventasDelDia,
          ingresosTotalesDelDia,
          egresosTotalesDelDia,
          gastosDelDia,
          utilidadVentaDelDia,
          utilidadInteresEmpenoDelDia,
        ] = await Promise.all([
          this.comprasDelDia(branchId, from, to),
          this.ventasDelDia(branchId, from, to),
          this.sumCashMovements(branchId, from, to, CashMovementType.CashIn),
          this.sumCashMovements(branchId, from, to, CashMovementType.CashOut),
          this.gastosDelDia(branchId, from, to),
          this.utilidadVentaDelDia(currentUser.tenantId, branchId, from, to),
          this.utilidadInteresEmpenoDelDia(currentUser.tenantId, branchId, from, to),
        ]);
        return {
          fecha: dateStr,
          comprasDelDia,
          ventasDelDia,
          ingresosTotalesDelDia,
          egresosTotalesDelDia,
          gastosDelDia,
          utilidadVentaDelDia,
          utilidadInteresEmpenoDelDia,
          utilidadEstimadaDelDia: utilidadVentaDelDia + utilidadInteresEmpenoDelDia,
        };
      }),
    );

    const totales = rows.reduce(
      (acc, row) => ({
        comprasDelRango: acc.comprasDelRango + row.comprasDelDia,
        ventasDelRango: acc.ventasDelRango + row.ventasDelDia,
        ingresosTotalesDelRango: acc.ingresosTotalesDelRango + row.ingresosTotalesDelDia,
        egresosTotalesDelRango: acc.egresosTotalesDelRango + row.egresosTotalesDelDia,
        gastosDelRango: acc.gastosDelRango + row.gastosDelDia,
        utilidadVentaDelRango: acc.utilidadVentaDelRango + row.utilidadVentaDelDia,
        utilidadInteresEmpenoDelRango: acc.utilidadInteresEmpenoDelRango + row.utilidadInteresEmpenoDelDia,
        utilidadEstimadaDelRango: acc.utilidadEstimadaDelRango + row.utilidadEstimadaDelDia,
      }),
      {
        comprasDelRango: 0,
        ventasDelRango: 0,
        ingresosTotalesDelRango: 0,
        egresosTotalesDelRango: 0,
        gastosDelRango: 0,
        utilidadVentaDelRango: 0,
        utilidadInteresEmpenoDelRango: 0,
        utilidadEstimadaDelRango: 0,
      },
    );

    return { from: query.from, to: query.to, branchId, dias: rows, totales };
  }

  private async resolveBranchId(requestedBranchId: string | undefined, currentUser: AuthenticatedUser): Promise<string> {
    if (!requestedBranchId || requestedBranchId === currentUser.homeBranchId) {
      return currentUser.homeBranchId;
    }
    // Solo Admin puede pedir el cierre de una sucursal distinta a la propia,
    // y aun así debe ser del mismo tenant (aislamiento multi-tenant, CV-016).
    if (currentUser.role !== 'Admin') {
      throw new BadRequestException('No tienes permiso para consultar el cierre de otra sucursal');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: requestedBranchId, tenantId: currentUser.tenantId },
    });
    if (!branch) {
      throw new BadRequestException('La sucursal indicada no existe en tu empresa');
    }
    return branch.id;
  }

  /**
   * Compras del día: desembolsos (`ContractMovement.type = Disbursement`) de
   * contratos `Pawn` o `DirectPurchase` de la sucursal. Cada contrato de estos
   * dos tipos genera EXACTAMENTE un Disbursement (ver
   * `contracts.service.ts#recordDisbursement`), y un `Sale` nunca crea uno —
   * un `Sale` solo produce el `CashMovement` CashIn que cuenta `ventasDelDia`.
   * Las dos cifras no se pueden solapar porque miran tablas distintas
   * (`ContractMovement` vs `CashMovement`) filtradas por `contractType`
   * mutuamente excluyentes (Pawn/DirectPurchase vs Sale).
   */
  private async comprasDelDia(branchId: string, from: Date, to: Date): Promise<number> {
    const result = await this.prisma.contractMovement.aggregate({
      _sum: { amount: true },
      where: {
        type: 'Disbursement',
        movementDate: { gte: from, lte: to },
        contract: {
          branchId,
          contractType: { in: [ContractType.Pawn, ContractType.DirectPurchase] },
        },
      },
    });
    return Number(result._sum.amount ?? 0);
  }

  /**
   * Ventas del día: `CashMovement` CashIn generados al crear un contrato
   * `Sale` (ver `contracts.service.ts` — `sourceType: 'Contract'`,
   * `contractId: contract.id`, `amount: dto.principalAmount`). Se filtra por
   * `contract.contractType = Sale`, así que un abono/liquidación de un Pawn
   * (que también es CashIn con `sourceType: 'Contract'`) queda excluido.
   */
  private async ventasDelDia(branchId: string, from: Date, to: Date): Promise<number> {
    const result = await this.prisma.cashMovement.aggregate({
      _sum: { amount: true },
      where: {
        type: CashMovementType.CashIn,
        sourceType: 'Contract',
        contractId: { not: null },
        createdAt: { gte: from, lte: to },
        cashRegister: { branchId },
        contract: { contractType: ContractType.Sale },
      },
    });
    return Number(result._sum.amount ?? 0);
  }

  private async sumCashMovements(branchId: string, from: Date, to: Date, type: CashMovementType): Promise<number> {
    const result = await this.prisma.cashMovement.aggregate({
      _sum: { amount: true },
      where: { type, createdAt: { gte: from, lte: to }, cashRegister: { branchId } },
    });
    return Number(result._sum.amount ?? 0);
  }

  /**
   * Gastos operativos del día: salidas de caja que NO son desembolso de
   * contrato (`contractId IS NULL`). Es lo que hoy se registra vía
   * `POST /cash-registers/:id/movements` con un `sourceType` libre
   * ("Gasto", "Arriendo", …) — no hay un endpoint de gasto dedicado, se
   * reutiliza lo ya registrable.
   */
  private async gastosDelDia(branchId: string, from: Date, to: Date): Promise<number> {
    const result = await this.prisma.cashMovement.aggregate({
      _sum: { amount: true },
      where: {
        type: CashMovementType.CashOut,
        contractId: null,
        createdAt: { gte: from, lte: to },
        cashRegister: { branchId },
      },
    });
    return Number(result._sum.amount ?? 0);
  }

  /**
   * Saldo corrido de la caja ABIERTA ahora mismo: `baseAmount + CashIn -
   * CashOut` de TODOS sus movimientos (no solo los de hoy), igual que
   * `cash.service.ts#getStatement`/`cash-statement.ts`. Si no hay caja
   * abierta, no hay saldo que mostrar: `null`, no error.
   */
  private async dineroDisponible(branchId: string): Promise<{ monto: number; cashRegisterId: string } | null> {
    const register = await this.prisma.cashRegister.findFirst({
      where: { branchId, status: CashRegisterStatus.Open },
      include: { movements: true },
    });
    if (!register) {
      return null;
    }
    const cashIn = register.movements
      .filter((m) => m.type === CashMovementType.CashIn)
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const cashOut = register.movements
      .filter((m) => m.type === CashMovementType.CashOut)
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const monto = Math.round((Number(register.baseAmount) + cashIn - cashOut + Number.EPSILON) * 100) / 100;
    return { monto, cashRegisterId: register.id };
  }

  private async valorInventarioAlCierre(tenantId: string, branchId: string) {
    const [disponible, comprometido, enProceso] = await Promise.all([
      this.prisma.item.aggregate({
        _sum: { costBasis: true },
        where: { tenantId, branchId, status: { in: DISPONIBLE_STATUSES } },
      }),
      this.prisma.item.aggregate({
        _sum: { costBasis: true },
        where: { tenantId, branchId, status: { in: COMPROMETIDO_STATUSES } },
      }),
      this.prisma.item.aggregate({
        _sum: { costBasis: true },
        where: { tenantId, branchId, status: { in: EN_PROCESO_STATUSES } },
      }),
    ]);
    const disponibleMonto = Number(disponible._sum.costBasis ?? 0);
    const comprometidoMonto = Number(comprometido._sum.costBasis ?? 0);
    const enProcesoMonto = Number(enProceso._sum.costBasis ?? 0);
    return {
      disponible: disponibleMonto,
      comprometido: comprometidoMonto,
      enProceso: enProcesoMonto,
      total: disponibleMonto + comprometidoMonto + enProcesoMonto,
    };
  }

  /**
   * Utilidad de venta directa (`ContractType.Sale`): `principalAmount -
   * item.costBasis`. No incluye empeño — ver `utilidadInteresEmpenoDelDia`.
   */
  private async utilidadVentaDelDia(tenantId: string, branchId: string, from: Date, to: Date): Promise<number> {
    const sales = await this.prisma.contract.findMany({
      where: {
        tenantId,
        branchId,
        contractType: ContractType.Sale,
        createdAt: { gte: from, lte: to },
      },
      select: { principalAmount: true, item: { select: { costBasis: true } } },
    });
    return sales.reduce((sum, sale) => sum + (Number(sale.principalAmount) - Number(sale.item.costBasis)), 0);
  }

  /**
   * Utilidad de empeño liquidado el día consultado: el sobrecosto
   * (interés) cobrado al liquidar, `ContractMovement.amount - principalAmount`
   * por cada `Settlement` de un contrato `Pawn` en el rango. El capital
   * liquidado no es utilidad (es la devolución del préstamo), solo el
   * sobrecosto lo es — mismo criterio que ya usa `onContractSettled` en el
   * listener contable (`settlementAmount - principalAmount`), aquí aplicado
   * como reporte de lectura, no como asiento.
   */
  private async utilidadInteresEmpenoDelDia(tenantId: string, branchId: string, from: Date, to: Date): Promise<number> {
    const settlements = await this.prisma.contractMovement.findMany({
      where: {
        type: ContractMovementType.Settlement,
        movementDate: { gte: from, lte: to },
        contract: { tenantId, branchId, contractType: ContractType.Pawn },
      },
      select: { amount: true, contract: { select: { principalAmount: true } } },
    });
    return settlements.reduce(
      (sum, s) => sum + (Number(s.amount) - Number(s.contract.principalAmount)),
      0,
    );
  }

  /**
   * Misma verificación que `cash.service.ts#openRegister` hace para bloquear
   * la apertura: la última caja CERRADA de la sucursal tiene un `CashCount`
   * con `resolutionStatus = 'Pending'`.
   */
  private async diferenciaCajaPendiente(branchId: string): Promise<boolean> {
    const lastClosed = await this.prisma.cashRegister.findFirst({
      where: { branchId, status: CashRegisterStatus.Closed },
      orderBy: { registerDate: 'desc' },
      include: { cashCount: true },
    });
    return !!(lastClosed?.cashCount && lastClosed.cashCount.resolutionStatus === 'Pending');
  }
}
