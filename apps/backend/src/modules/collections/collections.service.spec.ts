/**
 * Aislamiento multi-tenant en `contactHistory` (CV-016, corregido en Fase 6):
 * antes el `where` solo filtraba por `contractId`, así que cualquier usuario
 * autenticado que adivinara/conociera el UUID de un contrato de OTRO tenant
 * podía leer su historial de gestión de cobro completo (notas, canal,
 * quién llamó). La corrección agrega `contract: { tenantId }` al filtro.
 *
 * Prisma va mockeado: se verifica el `where` que se envía, no el resultado
 * de una base de datos real.
 */
import { CollectionsService } from './collections.service';

const currentUser = {
  userId: 'u-1',
  tenantId: 't-mio',
  homeBranchId: 'b-1',
  role: 'SalesAdvisor',
} as any;

function buildHarness() {
  const prisma = {
    collectionContactAttempt: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CollectionsService(prisma as any);
  return { service, prisma };
}

describe('CollectionsService#contactHistory — aislamiento multi-tenant', () => {
  it('filtra por contract.tenantId del usuario actual, no solo por contractId', async () => {
    const { service, prisma } = buildHarness();

    await service.contactHistory('c-ajeno', currentUser);

    expect(prisma.collectionContactAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: 'c-ajeno', contract: { tenantId: 't-mio' } },
      }),
    );
  });

  it('no arma un where que dependa solo del contractId (el bug que se corrigió)', async () => {
    const { service, prisma } = buildHarness();

    await service.contactHistory('c-1', currentUser);

    const { where } = prisma.collectionContactAttempt.findMany.mock.calls[0][0];
    // Si alguien vuelve a quitar el filtro de tenant, este assert falla:
    // un where reducido a `{ contractId: 'c-1' }` dejaría pasar cualquier tenant.
    expect(where).not.toEqual({ contractId: 'c-1' });
    expect(where.contract).toEqual({ tenantId: currentUser.tenantId });
  });
});
