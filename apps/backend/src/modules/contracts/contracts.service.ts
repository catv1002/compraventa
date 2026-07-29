import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CashMovementType,
  ContractMovementType,
  ContractStatus,
  ContractType,
  ItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';
import { CashService } from '../cash/cash.service';
// Vocabulario legal del libro de caja (RN-25). El mostrador dice "liquidar";
// el libro dice "CAPITAL LIQUIDACION" y "RETROVENTA". Ver
// cash/statement/cash-movement-detail.ts.
import {
  documentNumberOf,
  settlementPrincipalDetail,
  settlementSurchargeDetail,
} from '../cash/statement/cash-movement-detail';
import { CreateContractDto } from './dto/create-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { SettleContractDto } from './dto/settle-contract.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { PayInterestDto } from './dto/pay-interest.dto';
import { PayPrincipalDto } from './dto/pay-principal.dto';
import {
  addMonthsUTC,
  advancePaidThrough,
  monthlyToEffectiveAnnual,
  quoteInterest,
  quotePartialPayment,
  quoteSettlement,
  InterestPolicy,
  InterestQuote,
} from './interest/interest-calculator';
import {
  ContractCreatedEvent,
  ContractDefaultedEvent,
  ContractSettledEvent,
  ContractWithdrawnEvent,
  DirectPurchaseRegisteredEvent,
  DisbursementIssuedEvent,
  DomainEventNames,
  InterestPaymentRecordedEvent,
  ItemSoldEvent,
  LayawayCancelledEvent,
  LayawayCompletedEvent,
  LayawayCreatedEvent,
} from '../../shared/domain-events/events';

// Reglas de negocio y transiciones de la máquina de estados de Contract —
// ver docs/02-ciclos-de-vida.md (2.2) y docs/03-dominios-ddd.md (5. Contracts).
@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly cashService: CashService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Carga la política de devengo del tenant. Vive en configuración y no en
  // constantes para que cerrar la pregunta abierta sobre RN-13 (mes completo vs.
  // prorrateo) sea un cambio de parámetro, no un despliegue.
  private async loadInterestPolicy(tenantId: string, contractRate?: number) {
    const config = await this.prisma.tenantConfiguration.findUnique({ where: { tenantId } });
    const policy: InterestPolicy = {
      monthlyRate: contractRate ?? Number(config?.defaultMonthlyInterestRate ?? 0.04),
      // El default coincide con el del schema: el negocio cobra todo mes
      // empezado (RN-16 / CV-029). Un tenant sin configuración no debe caer en
      // una política que cotiza la mitad.
      accrual: (config?.interestAccrualPolicy ?? 'FullMonthCeil') as InterestPolicy['accrual'],
      rounding: (config?.interestRounding ?? 'NearestHundred') as InterestPolicy['rounding'],
    };
    return { config, policy };
  }

  /**
   * Reserva el siguiente consecutivo de la sucursal (RN-08 / CV-008).
   *
   * El `upsert` con `increment` es atómico a nivel de fila, así que dos cajeras
   * creando contratos al mismo tiempo no pueden obtener el mismo número. El
   * `contractNumberOffset` permite continuar la numeración legada —el negocio
   * va por el contrato 92.751— en vez de arrancar en 1.
   *
   * Recibe el cliente transaccional para poder reservar el número **dentro** de
   * la misma transacción que crea el contrato: si el contrato falla, el número
   * se devuelve con el rollback en vez de quedar como un hueco en la serie.
   * Un hueco no es cosmético — el negocio lleva el consecutivo también en un
   * libro físico y un salto obliga a explicar qué pasó con ese número.
   */
  private async nextContractNumber(
    tx: Prisma.TransactionClient,
    branchId: string,
    offset: number,
  ): Promise<number> {
    const sequence = await tx.contractSequence.upsert({
      where: { branchId },
      create: { branchId, lastNumber: offset + 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    return sequence.lastNumber;
  }

  async create(dto: CreateContractDto, currentUser: AuthenticatedUser) {
    const item = await this.inventoryService.findOne(dto.itemId, currentUser);
    const { config, policy } = await this.loadInterestPolicy(currentUser.tenantId, dto.interestRate);

    // La tasa del contrato es MENSUAL; maxLegalRate es EFECTIVA ANUAL. Compararlas
    // en crudo —como se hacía antes— dejaba pasar un 4% mensual (≈60% E.A.)
    // contra un tope de 19.5% creyendo que 0.04 < 0.195. Ver CV-015.
    //
    // Solo aplica a contratos de empeño: una venta o una compra directa no
    // devengan interés, y validarles la tasa por defecto del tenant las hacía
    // fallar sin motivo.
    if (config && dto.contractType === ContractType.Pawn) {
      const annualEquivalent = monthlyToEffectiveAnnual(policy.monthlyRate);
      if (annualEquivalent > Number(config.maxLegalRate)) {
        const detalle =
          `La tasa pactada (${(policy.monthlyRate * 100).toFixed(2)}% mensual, equivalente a ` +
          `${(annualEquivalent * 100).toFixed(2)}% efectivo anual) supera la tasa máxima legal ` +
          `configurada (${(Number(config.maxLegalRate) * 100).toFixed(2)}% efectivo anual)`;

        if (config.usuryCapPolicy === 'Block') {
          throw new BadRequestException(detalle);
        }
        // Warn: se registra el contrato, pero queda rastro explícito. Ver el
        // comentario de UsuryCapPolicy en schema.prisma sobre por qué no se
        // bloquea por defecto.
        this.logger.warn(`[usura] contrato de ${dto.customerId}: ${detalle}`);
      }
    }

    if (dto.contractType === ContractType.Pawn || dto.contractType === ContractType.DirectPurchase) {
      if (item.status !== ItemStatus.Appraised) {
        throw new BadRequestException('El artículo debe estar Appraised antes de crear el contrato');
      }
    }

    if (dto.contractType === ContractType.Sale && item.status !== ItemStatus.InStock) {
      throw new BadRequestException('Solo se puede vender un artículo en estado InStock');
    }

    if (dto.contractType === ContractType.Layaway && item.status !== ItemStatus.InStock) {
      throw new BadRequestException('Solo se puede apartar un artículo en estado InStock');
    }

    // Pawn (compraventa con pacto de retroventa) se crea SIN desembolsar —
    // el cliente debe confirmar los términos antes de que haya movimiento de
    // caja. Si no confirma, el contrato queda "Retirado" (withdraw()), sin
    // tocar caja ni inventario. Ver docs/01-investigacion-negocio.md §8.
    const requiresCashRegisterAtCreation =
      dto.contractType === ContractType.DirectPurchase || dto.contractType === ContractType.Sale;
    if (requiresCashRegisterAtCreation && !dto.cashRegisterId) {
      throw new BadRequestException('Este tipo de contrato requiere una caja abierta (cashRegisterId)');
    }
    const cashRegisterId = dto.cashRegisterId as string;

    const isImmediateTransaction = dto.contractType === ContractType.DirectPurchase || dto.contractType === ContractType.Sale;

    // El plazo no lo teclea el operador: sale de configuración (RN-02, 6 meses
    // por defecto). Se permite override explícito para casos excepcionales.
    const termMonths = config?.defaultTermMonths ?? 6;
    const dueDate =
      dto.contractType === ContractType.Pawn
        ? dto.dueDate
          ? new Date(dto.dueDate)
          : addMonthsUTC(new Date(), termMonths)
        : dto.dueDate
          ? new Date(dto.dueDate)
          : undefined;

    const contract = await this.prisma.$transaction(async (tx) => {
      const contractNumber = await this.nextContractNumber(
        tx,
        currentUser.homeBranchId,
        config?.contractNumberOffset ?? 0,
      );

      return tx.contract.create({
        data: {
          tenantId: currentUser.tenantId,
          branchId: currentUser.homeBranchId,
          contractNumber,
          customerId: dto.customerId,
          itemId: dto.itemId,
          contractType: dto.contractType,
          principalAmount: dto.principalAmount,
          // Solo los contratos de empeño devengan interés; una venta o una compra
          // directa se liquidan en el acto.
          interestRate: dto.contractType === ContractType.Pawn ? policy.monthlyRate : (dto.interestRate ?? 0),
          dueDate,
          status: isImmediateTransaction ? ContractStatus.Settled : ContractStatus.Created,
        },
      });
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.ContractCreated,
      new ContractCreatedEvent(contract.id, contract.contractType, Number(contract.principalAmount), contract.itemId),
    );

    // Pawn se queda en Created — ver disburse()/withdraw() más abajo. El
    // artículo permanece en Appraised hasta que haya desembolso confirmado.

    if (dto.contractType === ContractType.DirectPurchase) {
      await this.recordDisbursement(contract.id, cashRegisterId, dto.principalAmount, currentUser);
      await this.inventoryService.transitionStatus(dto.itemId, ItemStatus.InStock);
      await this.inventoryService.incrementCostBasis(dto.itemId, dto.principalAmount);
      await this.eventEmitter.emitAsync(
        DomainEventNames.DirectPurchaseRegistered,
        new DirectPurchaseRegisteredEvent(contract.id, dto.itemId, dto.principalAmount),
      );
    }

    if (dto.contractType === ContractType.Layaway) {
      await this.inventoryService.transitionStatus(dto.itemId, ItemStatus.OnLayaway);
      await this.prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.Active } });
      await this.eventEmitter.emitAsync(
        DomainEventNames.LayawayCreated,
        new LayawayCreatedEvent(contract.id, dto.itemId),
      );
    }

    if (dto.contractType === ContractType.Sale) {
      await this.cashService.recordMovement(cashRegisterId, {
        type: CashMovementType.CashIn,
        amount: dto.principalAmount,
        sourceType: 'Contract',
        contractId: contract.id,
      });
      await this.inventoryService.transitionStatus(dto.itemId, ItemStatus.Sold);
      await this.eventEmitter.emitAsync(
        DomainEventNames.ItemSold,
        new ItemSoldEvent(dto.itemId, dto.principalAmount, dto.customerId),
      );
    }

    return this.findOne(contract.id, currentUser);
  }

  private async recordDisbursement(contractId: string, cashRegisterId: string, amount: number, currentUser: AuthenticatedUser) {
    await this.prisma.contractMovement.create({
      data: { contractId, type: ContractMovementType.Disbursement, amount },
    });
    await this.cashService.recordMovement(cashRegisterId, {
      type: CashMovementType.CashOut,
      amount,
      sourceType: 'Contract',
      contractId,
    });
    await this.eventEmitter.emitAsync(
      DomainEventNames.DisbursementIssued,
      new DisbursementIssuedEvent(contractId, amount, currentUser.homeBranchId),
    );
  }

  // Confirma un contrato Pawn en estado Created: paga el valor de compra y
  // mueve el artículo a custodia. Separado de create() porque entre el
  // avalúo y el desembolso el cliente puede arrepentirse (ver withdraw()).
  async disburseContract(contractId: string, cashRegisterId: string, currentUser: AuthenticatedUser) {
    const contract = await this.findOwned(contractId, currentUser);
    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }
    if (contract.contractType !== ContractType.Pawn) {
      throw new BadRequestException('Solo los contratos de tipo Pawn se desembolsan por separado');
    }
    if (contract.status !== ContractStatus.Created) {
      throw new BadRequestException(`El contrato no admite desembolso en estado ${contract.status}`);
    }

    await this.recordDisbursement(contractId, cashRegisterId, Number(contract.principalAmount), currentUser);
    await this.inventoryService.transitionStatus(contract.itemId, ItemStatus.InPledgeCustody);

    // El interés corre desde que el cliente recibe la plata, no desde que se
    // creó el contrato: entre ambos momentos el cliente todavía podía retirarse
    // sin deber nada (ver withdraw()).
    const disbursedAt = new Date();
    return this.prisma.contract.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.Active,
        interestAccrualStart: disbursedAt,
        interestPaidThrough: null,
      },
    });
  }

  // "Contrato Retirado": el cliente no acepta los términos entre el avalúo y
  // el desembolso. No hay movimiento de caja — el artículo vuelve a estar
  // disponible en Appraised (nunca salió de ahí). Ver docs/01-investigacion-negocio.md §8.
  async withdraw(contractId: string, currentUser: AuthenticatedUser) {
    const contract = await this.findOwned(contractId, currentUser);
    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }
    if (contract.status !== ContractStatus.Created) {
      throw new BadRequestException(
        `Solo se puede retirar un contrato antes de desembolsar (estado actual: ${contract.status})`,
      );
    }

    const withdrawn = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.Cancelled },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.ContractWithdrawn,
      new ContractWithdrawnEvent(contractId, contract.itemId),
    );

    return withdrawn;
  }

  // Construye la entrada del motor de intereses a partir de un contrato
  // persistido. El capital vigente es principal - abonos a capital ya aplicados.
  private async buildQuoteInput(contract: {
    id: string;
    tenantId: string;
    principalAmount: unknown;
    paidAmount: unknown;
    interestRate: unknown;
    interestAccrualStart: Date | null;
    interestPaidThrough: Date | null;
    createdAt: Date;
  }, asOf: Date) {
    const { policy } = await this.loadInterestPolicy(contract.tenantId, Number(contract.interestRate));
    return {
      principal: Number(contract.principalAmount) - Number(contract.paidAmount),
      // Si el contrato es previo a este campo (o viene migrado), se cae a la
      // fecha de creación antes que fallar: es preferible cobrar de más tarde
      // que romper la consulta del cliente en el mostrador.
      accrualStart: contract.interestAccrualStart ?? contract.createdAt,
      paidThrough: contract.interestPaidThrough,
      asOf,
      policy,
    };
  }

  /**
   * "¿Cuánto debe este contrato?" — la pregunta que hoy se responde de cabeza.
   * Es de solo lectura: sirve tanto para la pantalla de consulta del cliente
   * como para que el operador vea el importe antes de cobrarlo.
   */
  async getQuote(contractId: string, currentUser: AuthenticatedUser, asOf = new Date()) {
    const contract = await this.findOne(contractId, currentUser);
    if (contract.contractType !== ContractType.Pawn) {
      throw new BadRequestException('Solo los contratos de empeño devengan intereses');
    }
    const input = await this.buildQuoteInput(contract, asOf);
    const settlement = quoteSettlement(input);
    return {
      contractId,
      contractNumber: contract.contractNumber,
      currentPrincipal: settlement.principal,
      monthlyAmount: settlement.quote.monthlyAmount,
      monthsOwed: settlement.quote.monthsOwed,
      interestOwed: settlement.interest,
      settlementTotal: settlement.total,
      isCurrent: settlement.quote.isCurrent,
      chargingFrom: settlement.quote.chargingFrom,
      nextAccrualDate: settlement.quote.nextAccrualDate,
      breakdown: settlement.quote.breakdown,
    };
  }

  /**
   * Pago de intereses (RN-04) — la operación más frecuente del mostrador.
   *
   * A diferencia de `renew()`, **no toca `dueDate` ni el estado del contrato**:
   * pagar los intereses de un mes atrasado no es renovar el contrato. Confundir
   * ambas cosas —como hacía el scaffold— hacía imposible el caso real de "debo
   * dos meses, pago uno y sigo en mora" (CV-009).
   */
  async payInterest(contractId: string, dto: PayInterestDto, currentUser: AuthenticatedUser) {
    const contract = await this.getActiveOrOverdue(contractId, currentUser);
    if (contract.contractType !== ContractType.Pawn) {
      throw new BadRequestException('Solo los contratos de empeño devengan intereses');
    }

    const input = await this.buildQuoteInput(contract, new Date());

    // El motor es puro y lanza Error genérico, que Nest traduciría a un 500.
    // Se valida aquí para devolver un 400 con un mensaje que el operador pueda
    // leer frente al cliente.
    const preview = quoteInterest(input);
    if (preview.monthsOwed === 0) {
      throw new BadRequestException('El contrato está al día: no hay intereses por cobrar');
    }
    if (dto.months > preview.monthsOwed) {
      throw new BadRequestException(
        `No se pueden pagar ${dto.months} mes(es): el contrato solo adeuda ${preview.monthsOwed}`,
      );
    }

    const { months, amount } = quotePartialPayment(input, dto.months);

    await this.prisma.contractMovement.create({
      data: { contractId, type: ContractMovementType.InterestPayment, amount },
    });
    await this.cashService.recordMovement(dto.cashRegisterId, {
      type: CashMovementType.CashIn,
      amount,
      sourceType: 'Contract',
      contractId,
    });
    await this.eventEmitter.emitAsync(
      DomainEventNames.InterestPaymentRecorded,
      new InterestPaymentRecordedEvent(contractId, amount),
    );

    const newPaidThrough = advancePaidThrough(input.paidThrough ?? input.accrualStart, months);
    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { interestPaidThrough: newPaidThrough },
    });

    return { contract: updated, monthsPaid: months, amountPaid: amount, quote: await this.getQuote(contractId, currentUser) };
  }

  /**
   * Abono a capital (RN-03 / CV-007).
   *
   * Se rechaza si el contrato tiene meses de interés vencidos. Es la regla que
   * la empleada describe como el "plus" del sistema legado, y la única razón por
   * la que el saldo de un contrato no se descuadra: el interés siempre se cobra
   * sobre un capital que ya está al día.
   */
  async payPrincipal(contractId: string, dto: PayPrincipalDto, currentUser: AuthenticatedUser) {
    const contract = await this.getActiveOrOverdue(contractId, currentUser);
    if (contract.contractType !== ContractType.Pawn) {
      throw new BadRequestException('Este contrato no admite abono a capital');
    }

    const input = await this.buildQuoteInput(contract, new Date());
    const quote: InterestQuote = quoteInterest(input);
    if (!quote.isCurrent) {
      throw new BadRequestException(
        `No se puede abonar a capital con intereses pendientes: el contrato adeuda ` +
          `${quote.monthsOwed} mes(es) por ${quote.totalOwed}. Debe ponerse al día primero.`,
      );
    }

    const currentPrincipal = input.principal;
    if (dto.amount > currentPrincipal) {
      throw new BadRequestException(
        `El abono (${dto.amount}) supera el capital vigente (${currentPrincipal}). ` +
          `Para cerrar el contrato use la liquidación.`,
      );
    }

    await this.prisma.contractMovement.create({
      data: { contractId, type: ContractMovementType.PrincipalPayment, amount: dto.amount },
    });
    await this.cashService.recordMovement(dto.cashRegisterId, {
      type: CashMovementType.CashIn,
      amount: dto.amount,
      sourceType: 'Contract',
      contractId,
    });

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { paidAmount: Number(contract.paidAmount) + dto.amount },
    });

    return { contract: updated, quote: await this.getQuote(contractId, currentUser) };
  }

  /**
   * Renovación explícita: extiende el vencimiento. Se mantiene separada del pago
   * de intereses (ver `payInterest`) y exige estar al día, porque renovar un
   * contrato en mora sería regalar los meses vencidos.
   */
  async renew(contractId: string, dto: RenewContractDto, currentUser: AuthenticatedUser) {
    const contract = await this.getActiveOrOverdue(contractId, currentUser);
    if (contract.contractType !== ContractType.Pawn) {
      throw new BadRequestException('Solo se renuevan contratos de empeño');
    }

    const input = await this.buildQuoteInput(contract, new Date());
    const quote = quoteInterest(input);
    if (!quote.isCurrent) {
      throw new BadRequestException(
        `No se puede renovar un contrato con ${quote.monthsOwed} mes(es) de interés pendientes ` +
          `(${quote.totalOwed}). Registre primero el pago de intereses.`,
      );
    }

    await this.prisma.contractMovement.create({
      data: { contractId, type: ContractMovementType.Renewal, amount: 0 },
    });

    return this.prisma.contract.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.Renewed,
        dueDate: new Date(dto.newDueDate),
        renewalCount: contract.renewalCount + 1,
      },
    });
  }

  /**
   * Liquidación: el cliente paga y retira la joya. El importe lo calcula el
   * servidor (capital vigente + intereses causados); si el cliente envía
   * `expectedTotal` y no coincide, se rechaza — así una pantalla desactualizada
   * no cobra de menos sin que nadie se entere.
   *
   * Asienta en caja DOS movimientos, no uno por el total (RN-26 / CV-032):
   * la retroventa (sobrecosto) y el capital van en filas separadas del libro.
   * Verificado en el legado: el contrato 92627, el 15/07 a las 16:11, produjo
   * `RETROVENTA … 72.000` y `CAPITAL LIQUIDACION … 1.800.000` como dos filas del
   * mismo minuto. No es cosmético: el informe diario los presenta por separado
   * (`Contratos Liquidados` con `SobreCostos` aparte) y el P&L necesita el
   * ingreso financiero aislado del retorno de capital. Fundidos en un solo
   * importe no hay forma de volver a separarlos.
   *
   * Los dos asientos, el movimiento de contrato y el cierre del contrato viven
   * en la MISMA transacción. Una caja con el capital asentado y la retroventa
   * perdida cuadraría en apariencia y nadie la encontraría.
   */
  async settle(contractId: string, dto: SettleContractDto, cashRegisterId: string, currentUser: AuthenticatedUser) {
    const contract = await this.getActiveOrOverdue(contractId, currentUser);
    // Restringido a empeño: antes settle() aceptaba cualquier contrato con un
    // monto libre. Ahora el total lo calcula el motor de intereses, y aplicarlo
    // a un Plan Separe cobraría su saldo pendiente bajo otra semántica sin que
    // nadie lo hubiera pedido. Layaway se cierra con payInstallment/cancelLayaway.
    if (contract.contractType !== ContractType.Pawn) {
      throw new BadRequestException(
        'Solo se liquidan contratos de empeño. Un Plan Separe se cierra con abonos o se cancela.',
      );
    }

    const input = await this.buildQuoteInput(contract, new Date());
    const { principal, interest, total } = quoteSettlement(input);

    if (dto.expectedTotal !== undefined && Math.abs(dto.expectedTotal - total) > 0.009) {
      throw new BadRequestException(
        `El total mostrado (${dto.expectedTotal}) no coincide con el calculado (${total}). ` +
          `Vuelva a consultar el contrato.`,
      );
    }

    const documentNumber = documentNumberOf(contract.contractNumber);
    const settledAt = new Date();

    const settled = await this.prisma.$transaction(async (tx) => {
      // El movimiento de contrato sigue siendo uno solo por el total: es el
      // historial del contrato ("se liquidó por X"), no el libro de caja. Quien
      // separa capital de sobrecosto es el asiento contable y, desde CV-032,
      // también el libro.
      await tx.contractMovement.create({
        data: {
          contractId,
          type: ContractMovementType.Settlement,
          amount: total,
          thirdPartyName: dto.thirdPartyName,
          thirdPartyIdNumber: dto.thirdPartyIdNumber,
        },
      });

      // Retroventa primero y capital después, que es el orden en que los
      // asienta el legado (C-07, contrato 92627). El orden entre ambos no
      // cambia el saldo final, pero un extracto que reproduce el del sistema
      // que el negocio conoce se audita sin explicaciones.
      //
      // Un contrato liquidado el mismo día del desembolso puede no haber
      // causado sobrecosto: en ese caso no se asienta una fila de cero, porque
      // una fila sin dinero en el libro de caja es ruido en el arqueo.
      if (interest > 0) {
        await this.cashService.recordMovement(
          cashRegisterId,
          {
            type: CashMovementType.CashIn,
            amount: interest,
            sourceType: 'Contract',
            contractId,
            documentNumber,
            detail: settlementSurchargeDetail(contract.contractNumber),
          },
          tx,
        );
      }

      // Mismo criterio: un capital ya devuelto a fuerza de abonos deja la
      // liquidación sin fila de capital, no con una fila de cero.
      if (principal > 0) {
        await this.cashService.recordMovement(
          cashRegisterId,
          {
            type: CashMovementType.CashIn,
            amount: principal,
            sourceType: 'Contract',
            contractId,
            documentNumber,
            detail: settlementPrincipalDetail(contract.contractNumber),
          },
          tx,
        );
      }

      return tx.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.Settled, interestPaidThrough: settledAt },
      });
    });

    // El evento se emite DESPUÉS de confirmar la transacción: sus consumidores
    // (contabilidad, inventario) leen la base y no deben ver estado sin commit.
    await this.eventEmitter.emitAsync(
      DomainEventNames.ContractSettled,
      new ContractSettledEvent(contractId, contract.itemId, total),
    );

    return { ...settled, settlementTotal: total, settlementPrincipal: principal, settlementInterest: interest };
  }

  // Plan Separe: abono a cuotas. Al alcanzar el precio pactado, el artículo se
  // vende (LayawayCompleted); si no, el contrato sigue Active con paidAmount
  // acumulado — ver docs/01-investigacion-negocio.md (2.4 Apartado).
  async payInstallment(contractId: string, dto: PayInstallmentDto, currentUser: AuthenticatedUser) {
    const contract = await this.findOwned(contractId, currentUser);
    if (!contract || contract.contractType !== ContractType.Layaway) {
      throw new BadRequestException('Este contrato no es un Plan Separe');
    }
    if (contract.status !== ContractStatus.Active) {
      throw new BadRequestException(`El contrato no admite abonos en estado ${contract.status}`);
    }

    await this.prisma.contractMovement.create({
      data: { contractId, type: ContractMovementType.PrincipalPayment, amount: dto.amount },
    });
    await this.cashService.recordMovement(dto.cashRegisterId, {
      type: CashMovementType.CashIn,
      amount: dto.amount,
      sourceType: 'Contract',
      contractId,
    });

    const newPaidAmount = Number(contract.paidAmount) + dto.amount;
    const completed = newPaidAmount >= Number(contract.principalAmount);

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        paidAmount: newPaidAmount,
        status: completed ? ContractStatus.Settled : ContractStatus.Active,
      },
    });

    if (completed) {
      await this.inventoryService.transitionStatus(contract.itemId, ItemStatus.Sold);
      await this.eventEmitter.emitAsync(
        DomainEventNames.LayawayCompleted,
        new LayawayCompletedEvent(contractId, contract.itemId, contract.customerId, Number(contract.principalAmount)),
      );
    }

    return updated;
  }

  async cancelLayaway(contractId: string, penaltyAmount = 0, currentUser?: AuthenticatedUser) {
    const contract = currentUser
      ? await this.findOwned(contractId, currentUser)
      : await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract || contract.contractType !== ContractType.Layaway) {
      throw new BadRequestException('Este contrato no es un Plan Separe');
    }
    if (contract.status !== ContractStatus.Active) {
      throw new BadRequestException(`El contrato no admite cancelación en estado ${contract.status}`);
    }

    const refundable = Number(contract.paidAmount) - penaltyAmount;

    const cancelled = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.Cancelled },
    });

    await this.inventoryService.transitionStatus(contract.itemId, ItemStatus.InStock);

    await this.eventEmitter.emitAsync(
      DomainEventNames.LayawayCancelled,
      new LayawayCancelledEvent(contractId, contract.itemId),
    );

    return { ...cancelled, refundable };
  }

  /**
   * Marca como vencidos los contratos que pasaron su fecha de vencimiento.
   *
   * **Ya no remata nada** (CV-010). El scaffold anterior pasaba automáticamente
   * a `Forfeited` todo lo que superara `dueDate + gracePeriodDays`, que es
   * justo lo contrario de lo que hace el negocio: la dueña deja correr los
   * contratos bastante más allá del plazo y decide **una por una** cuáles
   * remata (RN-05). Rematar por reloj le quitaría al cliente la joya sin que
   * nadie lo haya decidido — y sin el aviso previo que exige el art. 1943 C.C.
   */
  async processOverdueContracts(tenantId: string) {
    const now = new Date();

    const toMarkOverdue = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: [ContractStatus.Active, ContractStatus.Renewed] },
        dueDate: { lt: now },
      },
    });
    for (const contract of toMarkOverdue) {
      await this.prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.Overdue } });
    }

    return { markedOverdue: toMarkOverdue.length };
  }

  /**
   * Candidatos a remate: contratos vigentes cuya antigüedad **desde la firma**
   * supera el umbral configurado (8 meses por defecto, RN-05). Reemplaza el
   * filtro manual "de 8 meses en adelante" que hoy se teclea a mano en el
   * sistema legado. Es una consulta: no cambia nada.
   */
  async listForfeitureCandidates(currentUser: AuthenticatedUser) {
    const config = await this.prisma.tenantConfiguration.findUnique({
      where: { tenantId: currentUser.tenantId },
    });
    const thresholdMonths = config?.forfeitureThresholdMonths ?? 8;
    const cutoff = addMonthsUTC(new Date(), -thresholdMonths);

    const candidates = await this.prisma.contract.findMany({
      where: {
        tenantId: currentUser.tenantId,
        contractType: ContractType.Pawn,
        status: { in: [ContractStatus.Active, ContractStatus.Renewed, ContractStatus.Overdue] },
        createdAt: { lte: cutoff },
      },
      include: { customer: true, item: true },
      orderBy: { createdAt: 'asc' },
    });

    return { thresholdMonths, cutoff, count: candidates.length, candidates };
  }

  /**
   * Remate efectivo: acto humano y explícito sobre una selección concreta
   * (RN-05, RN-11). El artículo pasa a inventario disponible y el contrato queda
   * bloqueado para cualquier otra operación.
   */
  /**
   * Remate en tanda: todo o nada.
   *
   * La dueña selecciona varios contratos y confirma una vez (RN-05). La versión
   * anterior validaba y remataba contrato por contrato dentro del mismo bucle,
   * así que un contrato inválido en la posición 3 dejaba los dos primeros ya
   * rematados y lanzaba un error: la operadora veía un fallo sin saber qué
   * quedó hecho, y la única forma de averiguarlo era revisar contrato por
   * contrato. En una operación que transfiere la joya de una persona al
   * negocio, un resultado parcial y silencioso no es aceptable.
   *
   * De ahí las tres fases: se valida **todo** antes de tocar nada, se muta
   * dentro de una transacción, y los eventos se emiten solo después del commit
   * —si se emitieran dentro, contabilidad e inventario podrían leer un estado
   * que todavía puede revertirse—.
   */
  async forfeitContracts(contractIds: string[], currentUser: AuthenticatedUser) {
    const forfeitable: ContractStatus[] = [
      ContractStatus.Active,
      ContractStatus.Renewed,
      ContractStatus.Overdue,
    ];

    // Fase 1 — validación completa. Cualquier problema aborta sin haber
    // rematado nada.
    const contracts: Prisma.ContractGetPayload<Record<string, never>>[] = [];
    for (const contractId of contractIds) {
      const contract = await this.prisma.contract.findFirst({
        where: { id: contractId, tenantId: currentUser.tenantId },
      });
      if (!contract) {
        throw new NotFoundException(`Contrato ${contractId} no encontrado`);
      }
      if (!forfeitable.includes(contract.status)) {
        throw new BadRequestException(
          `El contrato ${contract.contractNumber} no se puede rematar en estado ${contract.status}. ` +
            'No se remató ninguno de los contratos seleccionados.',
        );
      }
      contracts.push(contract);
    }

    // Fase 2 — mutación atómica. Los artículos se actualizan con el cliente
    // transaccional en vez de con InventoryService porque sus métodos todavía
    // no aceptan una transacción; mientras no la acepten, esta es la única
    // forma de que el remate sea atómico de punta a punta.
    await this.prisma.$transaction(async (tx) => {
      for (const contract of contracts) {
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: ContractStatus.Forfeited },
        });
        await tx.item.update({
          where: { id: contract.itemId },
          data: {
            status: ItemStatus.InStock,
            costBasis: { increment: Number(contract.principalAmount) },
          },
        });
      }
    });

    // Fase 3 — eventos, ya con todo confirmado en base.
    for (const contract of contracts) {
      await this.eventEmitter.emitAsync(
        DomainEventNames.ContractDefaulted,
        new ContractDefaultedEvent(contract.id, contract.itemId, Number(contract.principalAmount)),
      );
    }

    return { forfeited: contracts.map((c) => c.id) };
  }

  findAll(currentUser: AuthenticatedUser, status?: ContractStatus) {
    return this.prisma.contract.findMany({
      where: { tenantId: currentUser.tenantId, status },
      include: { customer: true, item: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { customer: true, item: true, movements: true },
    });
    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }
    return contract;
  }

  /**
   * Recupera un contrato garantizando que pertenece al tenant del usuario.
   *
   * Antes se usaba `findUnique` por id crudo en todas las operaciones de dinero,
   * así que conocer un uuid bastaba para pagar, liquidar o rematar el contrato
   * de otra empresa. Ver docs/12-gap-analysis-y-backlog.md (CV-016).
   */
  private async findOwned(contractId: string, currentUser: AuthenticatedUser) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId: currentUser.tenantId },
    });
    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }
    return contract;
  }

  private async getActiveOrOverdue(contractId: string, currentUser: AuthenticatedUser) {
    const contract = await this.findOwned(contractId, currentUser);
    const allowedStatuses: ContractStatus[] = [ContractStatus.Active, ContractStatus.Renewed, ContractStatus.Overdue];
    if (!allowedStatuses.includes(contract.status)) {
      throw new BadRequestException(`El contrato no admite esta operación en estado ${contract.status}`);
    }
    return contract;
  }
}
