import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditRecordInput {
  userId?: string;
  branchId?: string;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput) {
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        branchId: input.branchId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        oldValue: input.oldValue as any,
        newValue: input.newValue as any,
      },
    });
  }

  /**
   * Estado actual de una entidad, para guardarlo como `oldValue` antes de que el
   * handler la modifique.
   *
   * El mapa es explícito a propósito: derivar el modelo de Prisma del nombre de
   * la entidad con acceso dinámico convertiría el string de un decorador en una
   * consulta arbitraria contra cualquier tabla.
   */
  async loadSnapshot(entity: string, id: string): Promise<unknown | null> {
    switch (entity) {
      case 'Contract':
        return this.prisma.contract.findUnique({ where: { id } });
      case 'Customer':
        return this.prisma.customer.findUnique({ where: { id } });
      case 'Item':
        return this.prisma.item.findUnique({ where: { id } });
      case 'CashRegister':
        return this.prisma.cashRegister.findUnique({ where: { id } });
      default:
        return null;
    }
  }
}
