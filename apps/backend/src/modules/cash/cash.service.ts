import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CashMovementType, CashRegisterStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { OpenRegisterDto } from './dto/open-register.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { CashStatementQueryDto } from './dto/cash-statement-query.dto';
import { buildCashStatement, CashLedgerEntry } from './statement/cash-statement';
import { fallbackDetail } from './statement/cash-movement-detail';
import {
  CashMovementRecordedEvent,
  CashRegisterClosedEvent,
  CashRegisterOpenedEvent,
  DomainEventNames,
} from '../../shared/domain-events/events';

/**
 * Fin de rango INCLUSIVO. Si `value` trae solo la fecha (`2026-07-15`), el
 * operador que pide "del 15 al 15" espera el día entero, no las cero horas del
 * 15: se extiende hasta el último milisegundo. Si trae hora explícita se
 * respeta tal cual.
 */
function endOfRange(value: string): Date {
  const parsed = new Date(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  if (isDateOnly) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async openRegister(dto: OpenRegisterDto, currentUser: AuthenticatedUser) {
    const alreadyOpen = await this.prisma.cashRegister.findFirst({
      where: { branchId: currentUser.homeBranchId, status: CashRegisterStatus.Open },
    });
    if (alreadyOpen) {
      throw new BadRequestException('Ya existe una caja abierta en esta sucursal');
    }

    const lastClosed = await this.prisma.cashRegister.findFirst({
      where: { branchId: currentUser.homeBranchId, status: CashRegisterStatus.Closed },
      orderBy: { registerDate: 'desc' },
      include: { cashCount: true },
    });
    if (lastClosed?.cashCount && lastClosed.cashCount.resolutionStatus === 'Pending') {
      throw new BadRequestException(
        'No se puede abrir caja: la caja anterior tiene una diferencia de arqueo sin resolver',
      );
    }

    const register = await this.prisma.cashRegister.create({
      data: {
        branchId: currentUser.homeBranchId,
        openedById: currentUser.userId,
        baseAmount: dto.baseAmount,
        status: CashRegisterStatus.Open,
      },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.CashRegisterOpened,
      new CashRegisterOpenedEvent(register.id, register.branchId, dto.baseAmount),
    );

    return register;
  }

  /**
   * Puerta ÚNICA por la que pasa todo el dinero: ningún módulo escribe
   * `cashMovement` directamente.
   *
   * `tx` permite asentar dentro de una transacción de negocio ya abierta. Existe
   * para RN-26: una liquidación produce dos asientos —capital y retroventa— que
   * deben confirmarse junto con el cierre del contrato o no confirmarse ninguno.
   * Una caja con el capital asentado y la retroventa perdida es peor que una sin
   * ninguno de los dos, porque cuadra en apariencia.
   */
  async recordMovement(
    cashRegisterId: string,
    dto: RecordMovementDto,
    currentUser: AuthenticatedUser,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    // Aislamiento multi-tenant: `CashRegister` no lleva `tenantId` propio, así
    // que se filtra a través de la sucursal (CV-016). Sin esto, conocer un
    // `cashRegisterId` ajeno bastaría para meter un movimiento en la caja de
    // otra empresa.
    const register = await db.cashRegister.findFirst({
      where: { id: cashRegisterId, branch: { tenantId: currentUser.tenantId } },
    });
    if (!register || register.status !== CashRegisterStatus.Open) {
      throw new BadRequestException('La caja no está abierta');
    }

    const movement = await db.cashMovement.create({
      data: {
        cashRegisterId,
        type: dto.type,
        amount: dto.amount,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        contractId: dto.contractId,
        documentNumber: dto.documentNumber ?? null,
        // El detalle se persiste sí o sí: es lo único del asiento que no se
        // reconstruye después (RN-25 / CV-032). Si el llamante no lo aporta se
        // escribe uno de último recurso, que no inventa terminología legal.
        detail: dto.detail?.trim() || fallbackDetail(dto.sourceType, dto.documentNumber),
        paymentMethod: dto.paymentMethod,
      },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.CashMovementRecorded,
      new CashMovementRecordedEvent(
        cashRegisterId,
        dto.type as 'CashIn' | 'CashOut',
        dto.amount,
        dto.sourceType,
        dto.contractId ?? null,
      ),
    );

    return movement;
  }

  // La diferencia de caja la calcula el servidor, nunca el cliente: el
  // cajero solo aporta el dato que solo él puede aportar —cuánto efectivo
  // hay físicamente en el cajón— y el sistema lo compara contra lo que
  // debería haber según sus propios movimientos. Antes se guardaba
  // `dto.discrepancy` tal cual llegaba, así que un cajero podía cerrar con
  // "0" sin haber contado nada.
  //
  // Solo movimientos en EFECTIVO entran al esperado: una venta por
  // transferencia/tarjeta no pasa por el cajón físico, así que compararla
  // contra el conteo de billetes produciría una diferencia falsa.
  async closeRegister(id: string, dto: CloseRegisterDto, currentUser: AuthenticatedUser) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, branch: { tenantId: currentUser.tenantId } },
      include: { movements: true },
    });
    if (!register) {
      throw new NotFoundException('Caja no encontrada');
    }

    const cashIn = register.movements
      .filter((m) => m.type === CashMovementType.CashIn && m.paymentMethod === PaymentMethod.Cash)
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const cashOut = register.movements
      .filter((m) => m.type === CashMovementType.CashOut && m.paymentMethod === PaymentMethod.Cash)
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const expectedCash = Number(register.baseAmount) + cashIn - cashOut;
    const discrepancy = Math.round((dto.physicalCount - expectedCash + Number.EPSILON) * 100) / 100;

    await this.prisma.cashCount.create({
      data: {
        cashRegisterId: id,
        discrepancy,
        resolutionStatus: discrepancy === 0 ? 'Resolved' : 'Pending',
      },
    });

    const closed = await this.prisma.cashRegister.update({
      where: { id },
      data: { status: CashRegisterStatus.Closed },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.CashRegisterClosed,
      new CashRegisterClosedEvent(id, discrepancy),
    );

    return { ...closed, expectedCash, physicalCount: dto.physicalCount, discrepancy };
  }

  /**
   * Extracto de caja con saldo corrido (CV-032) — la pantalla C-07 del legado.
   *
   * Devuelve las filas en orden cronológico con documento, fecha, detalle,
   * débito, crédito, saldo y fecha de proceso. **El saldo lo arrastra el
   * servidor**, nunca el cliente: es el número con el que el negocio cuadra el
   * día y no puede depender de qué pantalla lo abrió.
   *
   * Decisión de diseño sobre el saldo inicial de un rango de varios días: se
   * toma la base de la PRIMERA caja del rango y a partir de ahí se encadenan
   * todos los movimientos, ignorando la base de las cajas siguientes. Es lo
   * correcto por RN-09 —al cerrar no se retira el efectivo, así que el saldo de
   * cierre ES el inicial del día siguiente— y además es lo prudente hoy: la
   * apertura todavía recibe `baseAmount` del cliente en vez de heredarlo del
   * cierre anterior (CV-018), de modo que sumar cada base volvería a contar
   * dinero que ya está en la cadena. Cuando CV-018 cierre, este cálculo sigue
   * siendo válido sin cambios. **[por confirmar]** con el negocio que el
   * extracto multi-día deba encadenar así y no reiniciar por día.
   */
  async getStatement(dto: CashStatementQueryDto, currentUser: AuthenticatedUser) {
    const branchId = dto.branchId ?? currentUser.homeBranchId;
    const from = new Date(dto.from);
    const to = endOfRange(dto.to);

    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('El rango de fechas está invertido: "to" es anterior a "from"');
    }

    // Aislamiento multi-tenant: `CashRegister` no lleva `tenantId` propio, así
    // que se filtra a través de la sucursal. Sin esto, conocer un `branchId` o
    // un `cashRegisterId` ajeno bastaría para leer el libro de caja de otra
    // empresa (CV-016).
    const registers = await this.prisma.cashRegister.findMany({
      where: {
        branchId,
        branch: { tenantId: currentUser.tenantId },
        ...(dto.cashRegisterId ? { id: dto.cashRegisterId } : {}),
        registerDate: { gte: from, lte: to },
      },
      orderBy: [{ registerDate: 'asc' }],
      include: {
        movements: { orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }] },
      },
    });

    const saldoInicial = registers.length > 0 ? Number(registers[0].baseAmount) : 0;

    const entries: CashLedgerEntry[] = registers.flatMap((register) =>
      register.movements.map((movement) => ({
        id: movement.id,
        seq: movement.seq,
        documentNumber: movement.documentNumber,
        detail: movement.detail,
        type: movement.type as CashLedgerEntry['type'],
        // `Number()` solo en el borde: dentro de la base los importes son
        // Decimal(14,2) y el cálculo del saldo normaliza a dos decimales.
        amount: Number(movement.amount),
        createdAt: movement.createdAt,
        contractId: movement.contractId,
      })),
    );

    const statement = buildCashStatement(saldoInicial, entries);

    return {
      branchId,
      from,
      to,
      cashRegisterIds: registers.map((register) => register.id),
      ...statement,
    };
  }

  findOpenForBranch(branchId: string) {
    return this.prisma.cashRegister.findFirst({
      where: { branchId, status: CashRegisterStatus.Open },
      include: { movements: true },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, branch: { tenantId: currentUser.tenantId } },
      include: { movements: true, cashCount: true },
    });
    if (!register) {
      throw new NotFoundException('Caja no encontrada');
    }
    return register;
  }
}
