import { BadRequestException, Injectable } from '@nestjs/common';
import { CashMovementType, CashRegisterStatus, ContractType, ItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { DailyCloseQueryDto } from './dto/daily-close-query.dto';

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
      utilidadEstimadaDelDia,
      diferenciaCajaPendiente,
    ] = await Promise.all([
      this.comprasDelDia(branchId, from, to),
      this.ventasDelDia(branchId, from, to),
      this.sumCashMovements(branchId, from, to, CashMovementType.CashIn),
      this.sumCashMovements(branchId, from, to, CashMovementType.CashOut),
      this.gastosDelDia(branchId, from, to),
      this.dineroDisponible(branchId),
      this.valorInventarioAlCierre(currentUser.tenantId, branchId),
      this.utilidadEstimadaDelDia(currentUser.tenantId, branchId, from, to),
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
      utilidadEstimadaDelDia,
      dineroDisponible,
      // Foto de AHORA, no reconstruida para `dateStr`: el inventario no se
      // versiona por fecha, así que el desglose siempre refleja el estado
      // actual, no el del día consultado.
      valorInventarioAlCierre,
      diferenciaCajaPendiente,
    };
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
   * Utilidad ESTIMADA del día: solo cubre contratos `Sale` directos
   * (`principalAmount - item.costBasis`). NO incluye el interés/sobrecosto
   * devengado en liquidaciones de `Pawn` — ese es un concepto distinto
   * (devengo de intereses, RN de la calculadora de intereses) y mezclarlo
   * aquí distorsionaría ambas cifras. Una futura iteración puede sumar esa
   * utilidad de empeño liquidado como una línea aparte.
   */
  private async utilidadEstimadaDelDia(tenantId: string, branchId: string, from: Date, to: Date): Promise<number> {
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
