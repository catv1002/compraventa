import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContractType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from './accounting.service';
import {
  ContractDefaultedEvent,
  ContractSettledEvent,
  DisbursementIssuedEvent,
  DomainEventNames,
  InterestPaymentRecordedEvent,
  ItemSoldEvent,
  RepairCompletedEvent,
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

  @OnEvent(DomainEventNames.InterestPaymentRecorded)
  async onInterestPaymentRecorded(event: InterestPaymentRecordedEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract) return;

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.InterestPaymentRecorded, [
      { accountCode: '1000', debit: event.amount },
      { accountCode: '4100', credit: event.amount },
    ]);
  }

  @OnEvent(DomainEventNames.ContractSettled)
  async onContractSettled(event: ContractSettledEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract || contract.contractType !== ContractType.Pawn) return;

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.ContractSettled, [
      { accountCode: '1000', debit: event.settlementAmount },
      { accountCode: '1100', credit: Number(contract.principalAmount) },
      { accountCode: '4100', credit: event.settlementAmount - Number(contract.principalAmount) },
    ]);
  }

  @OnEvent(DomainEventNames.ContractDefaulted)
  async onContractDefaulted(event: ContractDefaultedEvent) {
    const contract = await this.prisma.contract.findUnique({ where: { id: event.contractId } });
    if (!contract) return;

    await this.accountingService.postEntry(contract.tenantId, DomainEventNames.ContractDefaulted, [
      { accountCode: '1200', debit: event.outstandingPrincipal },
      { accountCode: '1100', credit: event.outstandingPrincipal },
    ]);
  }

  @OnEvent(DomainEventNames.ItemSold)
  async onItemSold(event: ItemSoldEvent) {
    const item = await this.prisma.item.findUnique({ where: { id: event.itemId } });
    if (!item) return;

    const costBasis = Number(item.costBasis);

    const lines = [
      { accountCode: '1000', debit: event.price },
      { accountCode: '4000', credit: event.price },
    ];
    if (costBasis > 0) {
      lines.push({ accountCode: '5000', debit: costBasis }, { accountCode: '1200', credit: costBasis });
    }

    await this.accountingService.postEntry(item.tenantId, DomainEventNames.ItemSold, lines);
  }

  @OnEvent(DomainEventNames.RepairCompleted)
  async onRepairCompleted(event: RepairCompletedEvent) {
    if (event.totalCost <= 0) return;
    const item = await this.prisma.item.findUnique({ where: { id: event.itemId } });
    if (!item) return;

    await this.accountingService.postEntry(item.tenantId, DomainEventNames.RepairCompleted, [
      { accountCode: '1200', debit: event.totalCost },
      { accountCode: '2000', credit: event.totalCost },
    ]);
  }
}
