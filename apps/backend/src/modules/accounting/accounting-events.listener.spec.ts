/**
 * `AccountingEventsListener` es el módulo de mayor riesgo del proyecto: cada
 * método mueve dinero entre cuentas contables sin intervención humana. Esta
 * prueba fija en concreto el bug corregido en la Fase 6 (`onContractSettled`
 * usando capital VIGENTE, no original) y el comportamiento nuevo de la Fase 7
 * (`onPrincipalPaymentRecorded`, `onCashMovementRecorded`,
 * `provisionOverdueDebt`), además de la causación de interés y el reverso de
 * venta.
 *
 * Prisma y `AccountingService` van mockeados: lo que se prueba es la regla de
 * negocio (qué cuentas, qué montos, cuándo NO postear), no la persistencia.
 */
import { ContractStatus, ContractType } from '@prisma/client';
import { AccountingEventsListener } from './accounting-events.listener';
import {
  CashMovementRecordedEvent,
  ContractDefaultedEvent,
  ContractSettledEvent,
  DomainEventNames,
  ItemSoldEvent,
  PrincipalPaymentRecordedEvent,
  SaleReturnedEvent,
} from '../../shared/domain-events/events';

function buildHarness() {
  const prisma: any = {
    contract: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    tenantConfiguration: { findUnique: jest.fn().mockResolvedValue(null) },
    item: { findUnique: jest.fn() },
    cashRegister: { findUnique: jest.fn() },
  };
  // Fase 9: accrueInterest/provisionOverdueDebt postean dentro de
  // `$transaction`. El mock ejecuta el callback pasándole el mismo `prisma`
  // como `tx` — equivalente a "la transacción siempre confirma" para el
  // propósito de esta prueba (qué se postea, no la atomicidad en sí).
  prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
  const accountingService = { postEntry: jest.fn().mockResolvedValue({}) };
  const listener = new AccountingEventsListener(prisma as any, accountingService as any);
  return { listener, prisma, accountingService };
}

function pawnContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    tenantId: 't-1',
    branchId: 'b-1',
    contractType: ContractType.Pawn,
    status: ContractStatus.Active,
    principalAmount: 1_000_000,
    paidAmount: 0,
    interestRate: 0.04,
    interestAccrualStart: new Date('2026-06-01T00:00:00.000Z'),
    interestAccruedThrough: null,
    interestPaidThrough: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    provisionedAmount: 0,
    dueDate: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AccountingEventsListener', () => {
  describe('accrueInterest', () => {
    it('causa la diferencia entre el corte ya causado y el corte de hoy', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      const contract = pawnContract({
        interestAccrualStart: new Date('2026-06-01T00:00:00.000Z'),
        interestAccruedThrough: new Date('2026-07-01T00:00:00.000Z'), // ya causó un mes
      });
      prisma.contract.findUnique.mockResolvedValue(contract);

      const asOf = new Date('2026-08-01T00:00:00.000Z'); // dos meses desde el inicio
      const amount = await listener.accrueInterest('c-1', asOf);

      // Un mes ya causado (40.000) vs dos meses a hoy (80.000): la diferencia
      // es el segundo mes, no el acumulado completo.
      expect(amount).toBe(40_000);
      expect(accountingService.postEntry).toHaveBeenCalledWith(
        't-1',
        'InterestAccrued',
        [
          { accountCode: '1150', debit: 40_000, branchId: 'b-1' },
          { accountCode: '4100', credit: 40_000, branchId: 'b-1' },
        ],
        prisma, // tx: dentro de $transaction el mock pasa el mismo `prisma` como tx
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { interestAccruedThrough: asOf },
      });
    });

    it('no postea ni actualiza el contrato cuando el monto a causar es <= 0', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      const asOf = new Date('2026-07-01T00:00:00.000Z');
      const contract = pawnContract({
        interestAccrualStart: asOf,
        interestAccruedThrough: asOf, // ya causado hasta la misma fecha de corte
      });
      prisma.contract.findUnique.mockResolvedValue(contract);

      const amount = await listener.accrueInterest('c-1', asOf);

      expect(amount).toBeNull();
      expect(accountingService.postEntry).not.toHaveBeenCalled();
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('no hace nada si el contrato no es Pawn activo/vencido', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(
        pawnContract({ contractType: ContractType.Sale }),
      );

      const amount = await listener.accrueInterest('c-1');

      expect(amount).toBeNull();
      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onContractSettled', () => {
    it('usa el capital VIGENTE (principalAmount - paidAmount), no el original, para el interestPortion', async () => {
      // Este es exactamente el caso que reventaba antes de la Fase 6: hubo un
      // abono a capital previo (paidAmount > 0). Si el listener siguiera
      // usando `principalAmount` a secas, el crédito a 1100 sería mayor al
      // capital realmente pendiente y `interestPortion` daría negativo.
      const { listener, prisma, accountingService } = buildHarness();
      const contract = pawnContract({
        principalAmount: 1_000_000,
        paidAmount: 300_000, // abono previo a capital
        interestAccrualStart: new Date('2026-06-01T00:00:00.000Z'),
        interestAccruedThrough: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.contract.findUnique.mockResolvedValue(contract);

      const settlementAmount = 700_000 + 28_000; // capital vigente + sobrecosto
      const event = new ContractSettledEvent('c-1', 'item-1', settlementAmount);
      await listener.onContractSettled(event);

      const [, , entry] = accountingService.postEntry.mock.calls.find(
        (call: any[]) => call[1] === DomainEventNames.ContractSettled,
      )!;
      expect(entry).toEqual([
        { accountCode: '1000', debit: settlementAmount, branchId: 'b-1' },
        { accountCode: '1100', credit: 700_000, branchId: 'b-1' }, // capital vigente, no 1.000.000
        { accountCode: '1150', credit: 28_000, branchId: 'b-1' },
      ]);
      // Con el bug viejo (principalAmount a secas) el crédito a 1100 sería
      // 1.000.000 y esto fallaría.
      expect(entry.find((l: any) => l.accountCode === '1100').credit).not.toBe(1_000_000);
      expect(entry.find((l: any) => l.accountCode === '1150').credit).toBeGreaterThan(0);
    });

    it('no postea nada si el contrato no es Pawn', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(pawnContract({ contractType: ContractType.Sale }));

      await listener.onContractSettled(new ContractSettledEvent('c-1', 'item-1', 100));

      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onContractDefaulted', () => {
    it('postea el asiento de remate y reversa la provisión acumulada, atómicos en la misma transacción (Fase 13)', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      const contract = pawnContract({
        status: ContractStatus.Forfeited,
        provisionedAmount: 150_000,
      });
      prisma.contract.findUnique.mockResolvedValue(contract);

      const event = new ContractDefaultedEvent('c-1', 'item-1', 300_000);
      await listener.onContractDefaulted(event);

      // El asiento de remate se postea con el capital vigente que ya trae el evento.
      expect(accountingService.postEntry).toHaveBeenCalledWith(
        't-1',
        DomainEventNames.ContractDefaulted,
        [
          { accountCode: '1200', debit: 300_000, branchId: 'b-1' },
          { accountCode: '1100', credit: 300_000, branchId: 'b-1' },
        ],
        prisma,
      );
      // La provisión acumulada (150.000) se reversa en la MISMA transacción.
      expect(accountingService.postEntry).toHaveBeenCalledWith(
        't-1',
        'CarteraProvisionReversed',
        [
          { accountCode: '1105', debit: 150_000, branchId: 'b-1' },
          { accountCode: '5200', credit: 150_000, branchId: 'b-1' },
        ],
        prisma,
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { provisionedAmount: 0 },
      });
      // Ambos postEntry comparten el mismo `tx` (el mock de $transaction pasa
      // `prisma` como tx) — confirma que están dentro de la misma transacción,
      // no como dos pasos sueltos que podrían quedar a medias.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('no reversa nada si el contrato no tenía provisión acumulada', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      const contract = pawnContract({ status: ContractStatus.Forfeited, provisionedAmount: 0 });
      prisma.contract.findUnique.mockResolvedValue(contract);

      await listener.onContractDefaulted(new ContractDefaultedEvent('c-1', 'item-1', 300_000));

      expect(accountingService.postEntry).toHaveBeenCalledTimes(1); // solo el asiento de remate
      expect(accountingService.postEntry).not.toHaveBeenCalledWith(
        expect.anything(),
        'CarteraProvisionReversed',
        expect.anything(),
        expect.anything(),
      );
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });
  });

  describe('onPrincipalPaymentRecorded', () => {
    it('postea 1000 débito / 1100 crédito por el monto exacto del abono', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(pawnContract());

      await listener.onPrincipalPaymentRecorded(new PrincipalPaymentRecordedEvent('c-1', 250_000));

      expect(accountingService.postEntry).toHaveBeenCalledWith(
        't-1',
        DomainEventNames.PrincipalPaymentRecorded,
        [
          { accountCode: '1000', debit: 250_000, branchId: 'b-1' },
          { accountCode: '1100', credit: 250_000, branchId: 'b-1' },
        ],
      );
    });

    it('no postea si el contrato no existe', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(null);

      await listener.onPrincipalPaymentRecorded(new PrincipalPaymentRecordedEvent('c-x', 100));

      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onCashMovementRecorded', () => {
    it('postea 5100 débito / 1000 crédito para un CashOut SIN contractId (gasto operativo)', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.cashRegister.findUnique.mockResolvedValue({
        id: 'reg-1',
        branchId: 'b-1',
        branch: { tenantId: 't-1' },
      });

      const event = new CashMovementRecordedEvent('reg-1', 'CashOut', 50_000, 'Gasto', null);
      await listener.onCashMovementRecorded(event);

      expect(accountingService.postEntry).toHaveBeenCalledWith('t-1', DomainEventNames.CashMovementRecorded, [
        { accountCode: '5100', debit: 50_000, branchId: 'b-1' },
        { accountCode: '1000', credit: 50_000, branchId: 'b-1' },
      ]);
    });

    it('NO postea si el CashOut trae contractId (ya lo asentó otro handler específico)', async () => {
      const { listener, prisma, accountingService } = buildHarness();

      const event = new CashMovementRecordedEvent('reg-1', 'CashOut', 50_000, 'Contract', 'c-1');
      await listener.onCashMovementRecorded(event);

      expect(accountingService.postEntry).not.toHaveBeenCalled();
      expect(prisma.cashRegister.findUnique).not.toHaveBeenCalled();
    });

    it('NO postea para un CashIn', async () => {
      const { listener, accountingService } = buildHarness();

      const event = new CashMovementRecordedEvent('reg-1', 'CashIn', 50_000, 'Contract', null);
      await listener.onCashMovementRecorded(event);

      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('provisionOverdueDebt', () => {
    const OUTSTANDING = 1_000_000;

    function overdueContract(daysOverdue: number, provisionedAmount = 0) {
      const dueDate = new Date(Date.now() - daysOverdue * 24 * 60 * 60 * 1000);
      return pawnContract({
        status: ContractStatus.Overdue,
        principalAmount: OUTSTANDING,
        paidAmount: 0,
        dueDate,
        provisionedAmount,
      });
    }

    it.each([
      [15, 0],
      [45, 0.1],
      [120, 0.3],
      [200, 0.6],
    ])('tramo de %i días de mora provisiona al %s%%', async (days, rate) => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(overdueContract(days));

      const expectedAmount = Math.round(OUTSTANDING * (rate as number));
      const amount = await listener.provisionOverdueDebt('c-1');

      if (expectedAmount === 0) {
        expect(amount).toBeNull();
        expect(accountingService.postEntry).not.toHaveBeenCalled();
      } else {
        expect(amount).toBe(expectedAmount);
        expect(accountingService.postEntry).toHaveBeenCalledWith(
          't-1',
          'CarteraProvisioned',
          [
            { accountCode: '5200', debit: expectedAmount, branchId: 'b-1' },
            { accountCode: '1105', credit: expectedAmount, branchId: 'b-1' },
          ],
          prisma,
        );
      }
    });

    it('solo postea la DIFERENCIA contra lo ya provisionado, no lo vuelve a provisionar todo', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      // 120 días -> 30%; ya se había provisionado el 10% (100.000) en un ciclo anterior.
      prisma.contract.findUnique.mockResolvedValue(overdueContract(120, 100_000));

      const amount = await listener.provisionOverdueDebt('c-1');

      // 30% de 1.000.000 = 300.000; ya provisionado 100.000 => diferencia 200.000.
      expect(amount).toBe(200_000);
      expect(accountingService.postEntry).toHaveBeenCalledWith(
        't-1',
        'CarteraProvisioned',
        [
          { accountCode: '5200', debit: 200_000, branchId: 'b-1' },
          { accountCode: '1105', credit: 200_000, branchId: 'b-1' },
        ],
        prisma,
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { provisionedAmount: 300_000 },
      });
    });

    it('no provisiona dos veces el mismo tramo (diferencia = 0)', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      // 120 días -> 30% ya totalmente provisionado.
      prisma.contract.findUnique.mockResolvedValue(overdueContract(120, 300_000));

      const amount = await listener.provisionOverdueDebt('c-1');

      expect(amount).toBeNull();
      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });

    it('no hace nada si el contrato no está Overdue/Forfeited', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(
        pawnContract({ status: ContractStatus.Active, dueDate: new Date(Date.now() - 200 * 86400000) }),
      );

      const amount = await listener.provisionOverdueDebt('c-1');

      expect(amount).toBeNull();
      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });

    it('no hace nada si el contrato no es Pawn', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.contract.findUnique.mockResolvedValue(
        pawnContract({
          contractType: ContractType.Sale,
          status: ContractStatus.Overdue,
          dueDate: new Date(Date.now() - 200 * 86400000),
        }),
      );

      const amount = await listener.provisionOverdueDebt('c-1');

      expect(amount).toBeNull();
      expect(accountingService.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onSaleReturned — reverso exacto de onItemSold', () => {
    it('invierte débitos y créditos por los mismos montos y cuentas', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      const item = { id: 'item-1', tenantId: 't-1', branchId: 'b-1', costBasis: 200_000 };
      prisma.item.findUnique.mockResolvedValue(item);

      // Primero se vende...
      await listener.onItemSold(new ItemSoldEvent('item-1', 500_000, 'cust-1'));
      const ventaLines = accountingService.postEntry.mock.calls[0][2];

      accountingService.postEntry.mockClear();

      // ...y luego se devuelve por el mismo precio.
      await listener.onSaleReturned(new SaleReturnedEvent('c-1', 'item-1', 500_000));
      const devolucionLines = accountingService.postEntry.mock.calls[0][2];

      expect(ventaLines).toEqual([
        { accountCode: '1000', debit: 500_000, branchId: 'b-1' },
        { accountCode: '4000', credit: 500_000, branchId: 'b-1' },
        { accountCode: '5000', debit: 200_000, branchId: 'b-1' },
        { accountCode: '1200', credit: 200_000, branchId: 'b-1' },
      ]);
      expect(devolucionLines).toEqual([
        { accountCode: '4000', debit: 500_000, branchId: 'b-1' },
        { accountCode: '1000', credit: 500_000, branchId: 'b-1' },
        { accountCode: '1200', debit: 200_000, branchId: 'b-1' },
        { accountCode: '5000', credit: 200_000, branchId: 'b-1' },
      ]);
    });

    it('no incluye líneas de costo si el artículo no tiene costBasis', async () => {
      const { listener, prisma, accountingService } = buildHarness();
      prisma.item.findUnique.mockResolvedValue({ id: 'item-1', tenantId: 't-1', branchId: 'b-1', costBasis: 0 });

      await listener.onSaleReturned(new SaleReturnedEvent('c-1', 'item-1', 300_000));

      expect(accountingService.postEntry).toHaveBeenCalledWith('t-1', DomainEventNames.SaleReturned, [
        { accountCode: '4000', debit: 300_000, branchId: 'b-1' },
        { accountCode: '1000', credit: 300_000, branchId: 'b-1' },
      ]);
    });
  });
});
