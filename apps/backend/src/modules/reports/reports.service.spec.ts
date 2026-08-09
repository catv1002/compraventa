/**
 * `ReportsService` es de solo lectura, pero mezclar sus fuentes mal es
 * exactamente el tipo de error que una auditoría contable detecta: contar un
 * desembolso como gasto operativo, o sumar la utilidad de venta directa con
 * la de empeño como si vinieran del mismo lugar. Estas pruebas fijan que cada
 * cifra sale de la fuente correcta y no se contamina con la otra.
 *
 * Prisma va mockeado: se verifica el `where` de cada agregación / consulta.
 */
import { CashMovementType, ContractMovementType, ContractType } from '@prisma/client';
import { ReportsService } from './reports.service';

const currentUser = {
  userId: 'u-1',
  tenantId: 't-1',
  homeBranchId: 'b-1',
  role: 'SalesAdvisor',
} as any;

function buildPrisma() {
  return {
    branch: { findFirst: jest.fn() },
    contractMovement: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }), findMany: jest.fn().mockResolvedValue([]) },
    cashMovement: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    cashRegister: { findFirst: jest.fn().mockResolvedValue(null) },
    item: { aggregate: jest.fn().mockResolvedValue({ _sum: { costBasis: 0 } }) },
    contract: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('ReportsService', () => {
  describe('gastosDelDia', () => {
    it('filtra CashOut con contractId: null únicamente (gasto operativo, no desembolso)', async () => {
      const prisma = buildPrisma();
      const service = new ReportsService(prisma as any);
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-01T23:59:59.999Z');

      // Acceso al método privado vía cast — mismo patrón que otras specs del
      // proyecto para probar helpers internos sin exponerlos públicamente.
      await (service as any).gastosDelDia('b-1', from, to);

      expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith({
        _sum: { amount: true },
        where: {
          type: CashMovementType.CashOut,
          contractId: null,
          createdAt: { gte: from, lte: to },
          cashRegister: { branchId: 'b-1' },
        },
      });
    });

    it('no cuenta un CashOut con contractId (ese ya es un desembolso de contrato)', async () => {
      // No hay forma de "pasar" un contractId no-nulo con este where fijo:
      // esta prueba documenta la garantía de que el filtro SIEMPRE excluye
      // contractId no nulo, no solo en el caso feliz.
      const prisma = buildPrisma();
      const service = new ReportsService(prisma as any);

      await (service as any).gastosDelDia('b-1', new Date(), new Date());

      const { where } = prisma.cashMovement.aggregate.mock.calls[0][0];
      expect(where.contractId).toBeNull();
    });
  });

  describe('utilidadVentaDelDia vs utilidadInteresEmpenoDelDia — fuentes distintas, no se mezclan', () => {
    it('utilidadVentaDelDia lee contratos Sale (principalAmount - costBasis)', async () => {
      const prisma = buildPrisma();
      prisma.contract.findMany.mockResolvedValue([
        { principalAmount: 500_000, item: { costBasis: 300_000 } },
        { principalAmount: 200_000, item: { costBasis: 50_000 } },
      ]);
      const service = new ReportsService(prisma as any);
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-01T23:59:59.999Z');

      const utilidad = await (service as any).utilidadVentaDelDia('t-1', 'b-1', from, to);

      expect(prisma.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contractType: ContractType.Sale }),
        }),
      );
      expect(prisma.contractMovement.findMany).not.toHaveBeenCalled();
      expect(utilidad).toBe(200_000 + 150_000);
    });

    it('utilidadInteresEmpenoDelDia lee liquidaciones (ContractMovement Settlement) de Pawn, no contratos Sale', async () => {
      const prisma = buildPrisma();
      prisma.contractMovement.findMany.mockResolvedValue([
        { amount: 1_072_000, contract: { principalAmount: 1_000_000, paidAmount: 0 } },
      ]);
      const service = new ReportsService(prisma as any);
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-01T23:59:59.999Z');

      const utilidad = await (service as any).utilidadInteresEmpenoDelDia('t-1', 'b-1', from, to);

      expect(prisma.contractMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: ContractMovementType.Settlement,
            contract: { tenantId: 't-1', branchId: 'b-1', contractType: ContractType.Pawn },
          }),
        }),
      );
      expect(prisma.contract.findMany).not.toHaveBeenCalled();
      expect(utilidad).toBe(72_000);
    });

    it('las dos cifras se calculan de fuentes independientes y no se suman entre sí en el propio método', async () => {
      const prisma = buildPrisma();
      prisma.contract.findMany.mockResolvedValue([{ principalAmount: 900_000, item: { costBasis: 400_000 } }]);
      prisma.contractMovement.findMany.mockResolvedValue([
        { amount: 520_000, contract: { principalAmount: 500_000, paidAmount: 0 } },
      ]);
      const service = new ReportsService(prisma as any);
      const from = new Date();
      const to = new Date();

      const venta = await (service as any).utilidadVentaDelDia('t-1', 'b-1', from, to);
      const interes = await (service as any).utilidadInteresEmpenoDelDia('t-1', 'b-1', from, to);

      expect(venta).toBe(500_000);
      expect(interes).toBe(20_000);
      // Cambiar los datos de Sale no afecta el cálculo de Pawn y viceversa:
      // llamadas independientes, prisma.contract y prisma.contractMovement
      // no se cruzan.
      expect(prisma.contractMovement.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.contract.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
