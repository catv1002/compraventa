import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContractStatus, ContractType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from './accounting.service';
import { InterestPolicy, quoteInterest } from '../contracts/interest/interest-calculator';
import {
  ContractDefaultedEvent,
  ContractSettledEvent,
  DisbursementIssuedEvent,
  DomainEventNames,
  InterestPaymentRecordedEvent,
  ItemSoldEvent,
  PrincipalPaymentRecordedEvent,
  RepairCompletedEvent,
  SaleReturnedEvent,
} from '../../shared/domain-events/events';

// Traduce eventos de negocio de otros contextos en asientos contables
// automáticos — ver docs/03-dominios-ddd.md (7. Contabilidad) y
// docs/07-api-rest-graphql-eventos.md (catálogo de eventos).
//
// Nota de alcance: los eventos de Plan Separe (Layaway) todavía no generan
// asientos automáticos en este scaffold — ver README.md, "Simplificaciones".
@Injectable()
export class AccountingEventsListener {
  private readonly logger = new Logger(AccountingEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingService: AccountingService,
  ) {}

  @OnEvent(DomainEventNames.DisbursementIssued)
  async onDisbursementIssued(event: DisbursementIssuedEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract) return;

    const inventoryAccount = contract.contractType === ContractType.DirectPurchase ? '1200' : '1100';

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.DisbursementIssued, [
      { accountCode: inventoryAccount, debit: event.amount, branchId: event.branchId },
      { accountCode: '1000', credit: event.amount, branchId: event.branchId },
    ]);
  }

  /**
   * Causa (devenga) el interés ganado y no reconocido todavía de un contrato de
   * empeño, contra la cuenta puente `1150` (activo — dinero ya ganado que el
   * cliente no ha pagado). Corrige el hallazgo de la auditoría NIIF-PYME
   * (sección 2.36, causación): antes el ingreso `4100` solo aparecía al cobrar.
   *
   * Reutiliza `quoteInterest()` del motor de intereses (interest-calculator.ts)
   * dos veces: una hasta la fecha en que ya se causó ingreso
   * (`interestAccruedThrough ?? interestAccrualStart`) y otra hasta `asOf`. La
   * diferencia de `totalOwed` entre ambas cotizaciones es el interés devengado
   * en el período — nunca se reimplementa la fórmula de meses/tasa, solo se
   * compara el mismo cálculo puro en dos puntos de corte.
   *
   * Se invoca como catch-up antes de registrar cualquier cobro de interés
   * (`onInterestPaymentRecorded`) o liquidación (`onContractSettled`), para que
   * nunca se contabilice un cobro mayor a lo ya causado.
   */
  async accrueInterest(contractId: string, asOf: Date = new Date()) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract || contract.contractType !== ContractType.Pawn) return null;
    if (contract.status !== ContractStatus.Active && contract.status !== ContractStatus.Overdue) {
      return null;
    }

    const config = await this.prisma.tenantConfiguration.findUnique({
      where: { tenantId: contract.tenantId },
    });
    const policy: InterestPolicy = {
      monthlyRate: Number(contract.interestRate),
      accrual: (config?.interestAccrualPolicy ?? 'FullMonthCeil') as InterestPolicy['accrual'],
      rounding: (config?.interestRounding ?? 'NearestHundred') as InterestPolicy['rounding'],
    };

    const accrualStart = contract.interestAccrualStart ?? contract.createdAt;
    const alreadyAccruedThrough = contract.interestAccruedThrough ?? accrualStart;
    const principal = Number(contract.principalAmount) - Number(contract.paidAmount);

    // Cuánto se debía a la fecha de corte ya causada...
    const alreadyQuote = quoteInterest({
      principal,
      accrualStart,
      paidThrough: contract.interestPaidThrough,
      asOf: alreadyAccruedThrough,
      policy,
    });
    // ...contra cuánto se debe hoy. La diferencia es lo nuevo a causar.
    const nowQuote = quoteInterest({
      principal,
      accrualStart,
      paidThrough: contract.interestPaidThrough,
      asOf,
      policy,
    });

    const amount = nowQuote.totalOwed - alreadyQuote.totalOwed;
    if (amount <= 0) return null;

    await this.accountingService.postEntry(contract.tenantId, 'InterestAccrued', [
      { accountCode: '1150', debit: amount, branchId: contract.branchId },
      { accountCode: '4100', credit: amount, branchId: contract.branchId },
    ]);

    await this.prisma.contract.update({
      where: { id: contractId },
      data: { interestAccruedThrough: asOf },
    });

    return amount;
  }

  @OnEvent(DomainEventNames.InterestPaymentRecorded)
  async onInterestPaymentRecorded(event: InterestPaymentRecordedEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract) return;

    // Catch-up: nunca se cobra un interés que no se haya causado primero.
    await this.accrueInterest(contract.id);

    // El ingreso ya se reconoció en la causación (`4100`); cobrar solo reduce
    // el activo `1150` (intereses por cobrar), nunca vuelve a tocar `4100`.
    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.InterestPaymentRecorded, [
      { accountCode: '1000', debit: event.amount, branchId: contract.branchId },
      { accountCode: '1150', credit: event.amount, branchId: contract.branchId },
    ]);
  }

  @OnEvent(DomainEventNames.ContractSettled)
  async onContractSettled(event: ContractSettledEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract || contract.contractType !== ContractType.Pawn) return;

    // Catch-up: causa el interés pendiente hasta hoy antes de liquidar.
    await this.accrueInterest(contract.id);

    // El capital que sale de `1100` es el CAPITAL VIGENTE al momento de
    // liquidar (principalAmount - paidAmount), no el capital original del
    // contrato: si hubo abonos previos (`payPrincipal`), ya salieron de 1100
    // en su propio asiento. Usar principalAmount a secas aquí duplicaba la
    // salida de esos abonos y dejaba `interestPortion` negativo.
    const outstandingPrincipal = Number(contract.principalAmount) - Number(contract.paidAmount);
    const interestPortion = event.settlementAmount - outstandingPrincipal;

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.ContractSettled, [
      { accountCode: '1000', debit: event.settlementAmount, branchId: contract.branchId },
      { accountCode: '1100', credit: outstandingPrincipal, branchId: contract.branchId },
      { accountCode: '1150', credit: interestPortion, branchId: contract.branchId },
    ]);
  }

  // Un abono a capital mueve dinero real a caja y reduce la cartera de
  // préstamos (1100) de inmediato — antes este movimiento entraba a
  // `CashMovement` pero nunca al libro contable, dejando 1000 subestimada y
  // 1100 sobrestimada hasta la liquidación.
  @OnEvent(DomainEventNames.PrincipalPaymentRecorded)
  async onPrincipalPaymentRecorded(event: PrincipalPaymentRecordedEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract) return;

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.PrincipalPaymentRecorded, [
      { accountCode: '1000', debit: event.amount, branchId: contract.branchId },
      { accountCode: '1100', credit: event.amount, branchId: contract.branchId },
    ]);
  }

  @OnEvent(DomainEventNames.ContractDefaulted)
  async onContractDefaulted(event: ContractDefaultedEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract) return;

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.ContractDefaulted, [
      { accountCode: '1200', debit: event.outstandingPrincipal, branchId: contract.branchId },
      { accountCode: '1100', credit: event.outstandingPrincipal, branchId: contract.branchId },
    ]);
  }

  @OnEvent(DomainEventNames.ItemSold)
  async onItemSold(event: ItemSoldEvent) {
    const item = await this.prisma.item.findUnique({ where: { id: event.itemId } });
    if (!item) return;

    const costBasis = Number(item.costBasis);

    const lines = [
      { accountCode: '1000', debit: event.price, branchId: item.branchId },
      { accountCode: '4000', credit: event.price, branchId: item.branchId },
    ];
    if (costBasis > 0) {
      lines.push(
        { accountCode: '5000', debit: costBasis, branchId: item.branchId },
        { accountCode: '1200', credit: costBasis, branchId: item.branchId },
      );
    }

    await this.accountingService.postEntry(item.tenantId, DomainEventNames.ItemSold, lines);
  }

  // Reverso exacto de `onItemSold` — misma pieza, mismas cuentas, en el
  // sentido contrario. El costo vuelve a inventario (1200) porque el
  // artículo físico vuelve a estar disponible (`ContractsService.returnSale`
  // ya lo transiciona a `Returned`).
  @OnEvent(DomainEventNames.SaleReturned)
  async onSaleReturned(event: SaleReturnedEvent) {
    const item = await this.prisma.item.findUnique({ where: { id: event.itemId } });
    if (!item) return;

    const costBasis = Number(item.costBasis);

    const lines = [
      { accountCode: '4000', debit: event.price, branchId: item.branchId },
      { accountCode: '1000', credit: event.price, branchId: item.branchId },
    ];
    if (costBasis > 0) {
      lines.push(
        { accountCode: '1200', debit: costBasis, branchId: item.branchId },
        { accountCode: '5000', credit: costBasis, branchId: item.branchId },
      );
    }

    await this.accountingService.postEntry(item.tenantId, DomainEventNames.SaleReturned, lines);
  }

  @OnEvent(DomainEventNames.RepairCompleted)
  async onRepairCompleted(event: RepairCompletedEvent) {
    if (event.totalCost <= 0) return;
    const item = await this.prisma.item.findUnique({ where: { id: event.itemId } });
    if (!item) return;

    await this.accountingService.postEntry(item.tenantId, DomainEventNames.RepairCompleted, [
      { accountCode: '1200', debit: event.totalCost, branchId: item.branchId },
      { accountCode: '2000', credit: event.totalCost, branchId: item.branchId },
    ]);
  }
}
