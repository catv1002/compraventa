/**
 * Liquidación → libro de caja (RN-26 / CV-032).
 *
 * Cubre lo que la prueba pura de `cash/statement/cash-statement.spec.ts` no
 * puede cubrir: que `settle()` **parta** el cobro en dos asientos y que el
 * detalle legal llegue efectivamente a la escritura. El detalle es el único
 * dato del asiento que no se reconstruye después — si `settle()` deja de
 * pasarlo, nada más en el sistema lo nota, y por eso hay una prueba que falla
 * cuando eso ocurre.
 *
 * Prisma va mockeado a propósito: la regla que se prueba es de dominio, no de
 * persistencia, y una prueba de dominio que necesita una base de datos
 * levantada termina por no ejecutarse.
 */
import { CashMovementType, ContractMovementType, ContractStatus, ContractType } from '@prisma/client';
import { ContractsService } from './contracts.service';

const CAPITAL = 1_800_000;
const SOBRECOSTO = 72_000; // 4% mensual de 1.800.000, un mes causado (RN-01).
const CASH_REGISTER_ID = 'caja-15-07';

const currentUser = {
  userId: 'u-1',
  tenantId: 't-1',
  homeBranchId: 'b-1',
  role: 'Cashier',
} as any;

/** Contrato calcado del caso real del legado: 92627, liquidado el 15/07 a las 16:11. */
function buildContract(overrides: Record<string, unknown> = {}) {
  const veinteDiasAtras = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  return {
    id: 'c-92627',
    tenantId: 't-1',
    contractNumber: 92627,
    contractType: ContractType.Pawn,
    status: ContractStatus.Active,
    itemId: 'item-1',
    principalAmount: CAPITAL,
    paidAmount: 0,
    interestRate: 0.04,
    interestAccrualStart: veinteDiasAtras,
    interestPaidThrough: null,
    createdAt: veinteDiasAtras,
    ...overrides,
  };
}

function buildHarness(contract: Record<string, unknown>) {
  const tx = {
    contractMovement: { create: jest.fn().mockResolvedValue({ id: 'cm-1' }) },
    contract: {
      update: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({ ...contract, ...data })),
    },
  };

  const prisma = {
    contract: { findFirst: jest.fn().mockResolvedValue(contract) },
    tenantConfiguration: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  const cashService = { recordMovement: jest.fn().mockResolvedValue({ id: 'mov' }) };
  const inventoryService = { transitionStatus: jest.fn() };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };

  const service = new ContractsService(
    prisma as any,
    inventoryService as any,
    cashService as any,
    eventEmitter as any,
  );

  return { service, prisma, tx, cashService, eventEmitter };
}

describe('settle(): dos asientos de caja, no uno', () => {
  it('asienta capital y retroventa por separado (RN-26)', async () => {
    const { service, cashService } = buildHarness(buildContract());

    await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    // Lo que se rompía antes: un solo recordMovement por el total (1.872.000),
    // del que ya no hay forma de volver a separar el ingreso financiero.
    expect(cashService.recordMovement).toHaveBeenCalledTimes(2);

    const importes = cashService.recordMovement.mock.calls.map((call: any[]) => call[1].amount);
    expect(importes).toEqual([SOBRECOSTO, CAPITAL]);
    expect(importes).not.toContain(CAPITAL + SOBRECOSTO);
  });

  it('persiste el detalle legal de cada asiento (RN-25)', async () => {
    const { service, cashService } = buildHarness(buildContract());

    await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    const [retroventa, capital] = cashService.recordMovement.mock.calls.map(
      (call: any[]) => call[1],
    );

    expect(retroventa.detail).toBe('RETROVENTA PAGADO POR LIQUIDACION DEL CONTRATO # 92627');
    expect(capital.detail).toBe('CAPITAL LIQUIDACION DEL CONTRATO # 92627');

    // El documento del asiento es el consecutivo de negocio, no el uuid: es lo
    // que la dueña busca en el extracto cuando persigue un descuadre.
    expect(retroventa.documentNumber).toBe('92627');
    expect(capital.documentNumber).toBe('92627');

    // Ambos entran efectivo (débito) y ambos quedan enlazados al contrato, que
    // es el único hilo de trazabilidad del informe diario.
    for (const asiento of [retroventa, capital]) {
      expect(asiento.type).toBe(CashMovementType.CashIn);
      expect(asiento.contractId).toBe('c-92627');
    }
  });

  it('escribe los dos asientos y el cierre en la MISMA transacción', async () => {
    const { service, prisma, tx, cashService } = buildHarness(buildContract());

    await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // El cliente transaccional se propaga a caja: una caja con el capital
    // asentado y la retroventa perdida cuadraría en apariencia.
    for (const call of cashService.recordMovement.mock.calls) {
      expect(call[2]).toBe(tx);
    }
    expect(tx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ContractStatus.Settled }) }),
    );
    expect(tx.contractMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: ContractMovementType.Settlement }),
      }),
    );
  });

  it('el movimiento de contrato sigue siendo uno solo, por el total', async () => {
    // El historial del contrato responde "se liquidó por cuánto"; quien
    // desglosa capital y sobrecosto es el libro de caja y el asiento contable.
    const { service, tx } = buildHarness(buildContract());

    await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    expect(tx.contractMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.contractMovement.create.mock.calls[0][0].data.amount).toBe(CAPITAL + SOBRECOSTO);
  });

  it('no asienta una fila de cero cuando no hubo sobrecosto', async () => {
    // Contrato liquidado el mismo día del desembolso: no causó sobrecosto. Una
    // fila de 0.00 en el libro es ruido para quien cuadra la caja.
    const hoy = new Date();
    const { service, cashService } = buildHarness(
      buildContract({ interestAccrualStart: hoy, createdAt: hoy }),
    );

    await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    expect(cashService.recordMovement).toHaveBeenCalledTimes(1);
    expect(cashService.recordMovement.mock.calls[0][1]).toMatchObject({
      amount: CAPITAL,
      detail: 'CAPITAL LIQUIDACION DEL CONTRATO # 92627',
    });
  });

  it('devuelve el total desglosado para que la pantalla no lo recomponga', async () => {
    const { service } = buildHarness(buildContract());

    const result: any = await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    expect(result.settlementTotal).toBe(CAPITAL + SOBRECOSTO);
    expect(result.settlementPrincipal).toBe(CAPITAL);
    expect(result.settlementInterest).toBe(SOBRECOSTO);
  });

  it('emite el evento después de confirmar la transacción, no dentro', async () => {
    const { service, prisma, eventEmitter } = buildHarness(buildContract());

    const orden: string[] = [];
    prisma.$transaction.mockImplementation(async (cb: any) => {
      const out = await cb({
        contractMovement: { create: jest.fn().mockResolvedValue({}) },
        contract: { update: jest.fn().mockResolvedValue({ id: 'c-92627' }) },
      });
      orden.push('commit');
      return out;
    });
    eventEmitter.emitAsync.mockImplementation(async () => {
      orden.push('evento');
      return [];
    });

    await service.settle('c-92627', {} as any, CASH_REGISTER_ID, currentUser);

    expect(orden).toEqual(['commit', 'evento']);
  });
});
