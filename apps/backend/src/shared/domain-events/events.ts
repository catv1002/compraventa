// Catálogo de domain events (subconjunto de Fase 1) — ver docs/07-api-rest-graphql-eventos.md.
// Transporte: EventEmitter2 in-process (Fase 1-2, ver docs/08-arquitectura-tecnica.md).

export class ItemReceivedEvent {
  constructor(public readonly itemId: string, public readonly categoryId: string, public readonly branchId: string) {}
}

export class ItemAppraisedEvent {
  constructor(
    public readonly itemId: string,
    public readonly appraisedValue: number,
    public readonly loanablePercentage: number,
  ) {}
}

export class ContractCreatedEvent {
  constructor(
    public readonly contractId: string,
    public readonly contractType: string,
    public readonly principalAmount: number,
    public readonly itemId: string,
  ) {}
}

export class DisbursementIssuedEvent {
  constructor(public readonly contractId: string, public readonly amount: number, public readonly branchId: string) {}
}

export class ContractSettledEvent {
  constructor(public readonly contractId: string, public readonly itemId: string, public readonly settlementAmount: number) {}
}

export class ContractDefaultedEvent {
  constructor(public readonly contractId: string, public readonly itemId: string, public readonly outstandingPrincipal: number) {}
}

export class ItemSoldEvent {
  constructor(public readonly itemId: string, public readonly price: number, public readonly customerId: string) {}
}

export class SaleReturnedEvent {
  constructor(public readonly contractId: string, public readonly itemId: string, public readonly price: number) {}
}

export class CashRegisterOpenedEvent {
  constructor(public readonly cashRegisterId: string, public readonly branchId: string, public readonly baseAmount: number) {}
}

export class CashMovementRecordedEvent {
  constructor(
    public readonly cashRegisterId: string,
    public readonly type: 'CashIn' | 'CashOut',
    public readonly amount: number,
    public readonly sourceType: string,
    public readonly contractId: string | null = null,
  ) {}
}

export class CashRegisterClosedEvent {
  constructor(public readonly cashRegisterId: string, public readonly discrepancy: number) {}
}

// ---- Fase 2 ----

export class TransferReceivedEvent {
  constructor(public readonly itemId: string, public readonly toBranchId: string) {}
}

export class LayawayCreatedEvent {
  constructor(public readonly contractId: string, public readonly itemId: string) {}
}

export class LayawayCompletedEvent {
  constructor(public readonly contractId: string, public readonly itemId: string, public readonly customerId: string, public readonly totalPrice: number) {}
}

export class LayawayCancelledEvent {
  constructor(public readonly contractId: string, public readonly itemId: string) {}
}

export class RepairCompletedEvent {
  constructor(public readonly itemId: string, public readonly totalCost: number) {}
}

export class InterestPaymentRecordedEvent {
  constructor(public readonly contractId: string, public readonly amount: number) {}
}

export class PrincipalPaymentRecordedEvent {
  constructor(public readonly contractId: string, public readonly amount: number) {}
}

export class DirectPurchaseRegisteredEvent {
  constructor(public readonly contractId: string, public readonly itemId: string, public readonly amount: number) {}
}

// Contrato cancelado antes de desembolso ("Contrato Retirado" en la
// terminología real de la industria) — ver docs/01-investigacion-negocio.md §8.
export class ContractWithdrawnEvent {
  constructor(public readonly contractId: string, public readonly itemId: string) {}
}

export class InvoiceIssuedEvent {
  constructor(public readonly invoiceId: string, public readonly total: number, public readonly vatTotal: number) {}
}

export const DomainEventNames = {
  ItemReceived: 'item.received',
  ItemAppraised: 'item.appraised',
  ContractCreated: 'contract.created',
  DisbursementIssued: 'contract.disbursement-issued',
  ContractSettled: 'contract.settled',
  ContractDefaulted: 'contract.defaulted',
  ItemSold: 'item.sold',
  SaleReturned: 'contract.sale-returned',
  CashRegisterOpened: 'cash-register.opened',
  CashMovementRecorded: 'cash-register.movement-recorded',
  CashRegisterClosed: 'cash-register.closed',
  TransferReceived: 'transfer.received',
  LayawayCreated: 'layaway.created',
  LayawayCompleted: 'layaway.completed',
  LayawayCancelled: 'layaway.cancelled',
  RepairCompleted: 'repair.completed',
  InterestPaymentRecorded: 'contract.interest-payment-recorded',
  PrincipalPaymentRecorded: 'contract.principal-payment-recorded',
  DirectPurchaseRegistered: 'contract.direct-purchase-registered',
  InvoiceIssued: 'invoice.issued',
  ContractWithdrawn: 'contract.withdrawn',
} as const;
