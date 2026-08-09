import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { LogContactDto } from './dto/log-contact.dto';

// Gestión proactiva de vencimientos/mora, distinta del ciclo de vida técnico
// del contrato (que vive en Contracts) — ver docs/03-dominios-ddd.md (9. Cartera/Cobranza).
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  upcoming(currentUser: AuthenticatedUser, days: number) {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);

    return this.prisma.contract.findMany({
      where: {
        tenantId: currentUser.tenantId,
        status: { in: [ContractStatus.Active, ContractStatus.Renewed] },
        dueDate: { lte: limit },
      },
      include: { customer: true, item: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  overdue(currentUser: AuthenticatedUser) {
    return this.prisma.contract.findMany({
      where: { tenantId: currentUser.tenantId, status: ContractStatus.Overdue },
      include: { customer: true, item: true, collectionContacts: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  // Escritura cross-tenant (CV-016): sin verificar que el contrato sea del
  // mismo tenant, cualquier BranchManager/Admin autenticado podía crear un
  // CollectionContactAttempt contra un contractId de OTRO tenant si lo
  // conocía/adivinaba — más grave que la fuga de lectura que ya se cerró en
  // `contactHistory`, porque esta contamina el historial ajeno, no solo lo
  // lee.
  async logContact(contractId: string, dto: LogContactDto, currentUser: AuthenticatedUser) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId: currentUser.tenantId },
      select: { id: true },
    });
    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }

    return this.prisma.collectionContactAttempt.create({
      data: {
        contractId,
        channel: dto.channel,
        notes: dto.notes,
        createdById: currentUser.userId,
      },
    });
  }

  contactHistory(contractId: string, currentUser: AuthenticatedUser) {
    return this.prisma.collectionContactAttempt.findMany({
      where: { contractId, contract: { tenantId: currentUser.tenantId } },
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recoveryRate(currentUser: AuthenticatedUser) {
    const [settled, dueInPast] = await Promise.all([
      this.prisma.contract.count({
        where: { tenantId: currentUser.tenantId, status: ContractStatus.Settled, dueDate: { not: null } },
      }),
      this.prisma.contract.count({
        where: {
          tenantId: currentUser.tenantId,
          dueDate: { lt: new Date(), not: null },
          status: { in: [ContractStatus.Settled, ContractStatus.Overdue, ContractStatus.Expired, ContractStatus.Forfeited] },
        },
      }),
    ]);

    return { settled, dueInPast, recoveryRate: dueInPast === 0 ? null : settled / dueInPast };
  }
}
