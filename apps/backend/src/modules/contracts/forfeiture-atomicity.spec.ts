/**
 * Remate en tanda: todo o nada (RN-05 / CV-010).
 *
 * Por qué existe esta prueba: la versión anterior de `forfeitContracts()`
 * validaba y remataba dentro del mismo bucle, así que un contrato inválido en
 * la mitad de la selección dejaba los anteriores ya rematados y devolvía un
 * error. La dueña veía "falló" sin saber qué joyas habían cambiado de dueño.
 *
 * El remate transfiere la joya de una persona al negocio: un resultado parcial
 * y silencioso no es un detalle de implementación, es una pérdida patrimonial
 * imposible de rastrear desde la pantalla. Esta prueba falla si alguien vuelve
 * a mezclar validación con mutación.
 *
 * Prisma va mockeado: lo que se prueba es la secuencia de la operación, no la
 * persistencia.
 */
import { ContractStatus, ContractType, ItemStatus } from '@prisma/client';
import { ContractsService } from './contracts.service';

const currentUser = {
  userId: 'u-1',
  tenantId: 't-1',
  homeBranchId: 'b-1',
  role: 'Admin',
} as any;

function buildContract(id: string, contractNumber: number, status: ContractStatus) {
  return {
    id,
    tenantId: 't-1',
    contractNumber,
    contractType: ContractType.Pawn,
    status,
    itemId: `item-${contractNumber}`,
    principalAmount: 500_000,
  };
}

function buildHarness(contracts: ReturnType<typeof buildContract>[]) {
  const tx = {
    contract: { update: jest.fn().mockResolvedValue({}) },
    item: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    contract: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
        contracts.find((c) => c.id === where.id && c.tenantId === where.tenantId) ?? null,
      ),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };

  const inventoryService = {
    transitionStatus: jest.fn(),
    incrementCostBasis: jest.fn(),
  };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };

  const service = new ContractsService(
    prisma as any,
    inventoryService as any,
    {} as any,
    {} as any,
    eventEmitter as any,
  );

  return { service, prisma, tx, eventEmitter };
}

describe('forfeitContracts — todo o nada', () => {
  it('remata la tanda completa cuando todos los contratos son válidos', async () => {
    const contracts = [
      buildContract('c-1', 9001, ContractStatus.Active),
      buildContract('c-2', 9002, ContractStatus.Overdue),
      buildContract('c-3', 9003, ContractStatus.Renewed),
    ];
    const { service, tx, eventEmitter } = buildHarness(contracts);

    const result = await service.forfeitContracts(['c-1', 'c-2', 'c-3'], currentUser);

    expect(result.forfeited).toEqual(['c-1', 'c-2', 'c-3']);
    expect(tx.contract.update).toHaveBeenCalledTimes(3);
    expect(tx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ContractStatus.Forfeited } }),
    );
    // La joya pasa a inventario del negocio y suma su costo de adquisición.
    expect(tx.item.update).toHaveBeenCalledTimes(3);
    expect(tx.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ItemStatus.InStock, costBasis: { increment: 500_000 } },
      }),
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledTimes(3);
  });

  it('no remata NINGUNO si un contrato de la tanda está en estado no rematable', async () => {
    const contracts = [
      buildContract('c-1', 9001, ContractStatus.Active),
      buildContract('c-2', 9002, ContractStatus.Active),
      // El tercero ya fue liquidado: el cliente pagó y se llevó la joya.
      buildContract('c-3', 9003, ContractStatus.Settled),
    ];
    const { service, prisma, tx, eventEmitter } = buildHarness(contracts);

    await expect(service.forfeitContracts(['c-1', 'c-2', 'c-3'], currentUser)).rejects.toThrow(
      /9003.*no se puede rematar/s,
    );

    // Lo que importa: los dos primeros siguen intactos.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.contract.update).not.toHaveBeenCalled();
    expect(tx.item.update).not.toHaveBeenCalled();
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('no remata ninguno si un contrato no existe o es de otra empresa', async () => {
    const contracts = [buildContract('c-1', 9001, ContractStatus.Active)];
    const { service, prisma, tx } = buildHarness(contracts);

    await expect(service.forfeitContracts(['c-1', 'c-ajeno'], currentUser)).rejects.toThrow(
      /no encontrado/,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it('emite los eventos solo después de confirmar la transacción', async () => {
    const contracts = [buildContract('c-1', 9001, ContractStatus.Active)];
    const { service, prisma, eventEmitter } = buildHarness(contracts);

    const orden: string[] = [];
    prisma.$transaction.mockImplementation(async (fn: any) => {
      orden.push('transaccion');
      return fn({
        contract: { update: jest.fn().mockResolvedValue({}) },
        item: { update: jest.fn().mockResolvedValue({}) },
      });
    });
    eventEmitter.emitAsync.mockImplementation(async () => {
      orden.push('evento');
      return [];
    });

    await service.forfeitContracts(['c-1'], currentUser);

    // Si el evento saliera dentro de la transacción, contabilidad e inventario
    // podrían reaccionar a un remate que todavía puede revertirse.
    expect(orden).toEqual(['transaccion', 'evento']);
  });
});
