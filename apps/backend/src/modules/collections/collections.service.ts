import { Injectable } from '@nestjs/common';
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

  logContact(contractId: string, dto: LogContactDto, currentUser: AuthenticatedUser) {
    return this.prisma.collectionContactAttempt.create({
      data: {
        contractId,
        channel: dto.channel,
        notes: dto.notes,
        createdById: currentUser.userId,
      },
    });
  }

  contactHistory(contractId: string) {
    return this.prisma.collectionContactAttempt.findMany({
      where: { contractId },
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
