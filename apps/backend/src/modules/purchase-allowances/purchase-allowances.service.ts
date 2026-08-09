import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { AssignAllowanceDto } from './dto/assign-allowance.dto';

// Normaliza a medianoche UTC del día calendario — el cupo es por día, no por
// hora exacta, y así dos llamadas con la misma fecha (con o sin hora) golpean
// la misma fila vía el @@unique([userId, date]).
function dateOnly(value: string | Date): Date {
  const parsed = new Date(value);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

@Injectable()
export class PurchaseAllowancesService {
  constructor(private readonly prisma: PrismaService) {}

  // Quién puede asignar cupos: BranchManager/Admin del mismo tenant. El cupo
  // siempre se asigna en la sucursal del que lo otorga (homeBranchId del
  // BranchManager) — un vendedor con cupo en otra sede se resuelve moviéndolo
  // de sucursal, no asignándole cupo remoto.
  async assign(dto: AssignAllowanceDto, currentUser: AuthenticatedUser) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId: currentUser.tenantId },
    });
    if (!targetUser) {
      throw new BadRequestException('El usuario no existe en este tenant');
    }

    return this.prisma.purchaseAllowance.upsert({
      where: { userId_date: { userId: dto.userId, date: dateOnly(dto.date) } },
      create: {
        tenantId: currentUser.tenantId,
        branchId: targetUser.homeBranchId,
        userId: dto.userId,
        date: dateOnly(dto.date),
        assignedAmount: dto.assignedAmount,
        grantedById: currentUser.userId,
      },
      // Reasignar el mismo día no reinicia spentAmount: si ya compró con el
      // cupo de hoy, subir/bajar el tope no debe borrar lo ya gastado.
      update: {
        assignedAmount: dto.assignedAmount,
        grantedById: currentUser.userId,
      },
    });
  }

  async getFor(userId: string, date: Date, currentUser: AuthenticatedUser) {
    const allowance = await this.prisma.purchaseAllowance.findFirst({
      where: { userId, date: dateOnly(date), tenantId: currentUser.tenantId },
    });
    if (!allowance) {
      return { userId, date: dateOnly(date), assignedAmount: 0, spentAmount: 0, availableAmount: 0 };
    }
    return {
      ...allowance,
      availableAmount: Number(allowance.assignedAmount) - Number(allowance.spentAmount),
    };
  }

  // Quiénes son candidatos a recibir cupo: roles que efectivamente compran en
  // mostrador. BranchManager/Admin no necesitan cupo propio (no tienen tope).
  async listCandidates(branchId: string, currentUser: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: {
        tenantId: currentUser.tenantId,
        homeBranchId: branchId,
        active: true,
        role: { in: [UserRole.SalesAdvisor] },
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async listForBranch(branchId: string, date: Date, currentUser: AuthenticatedUser) {
    const allowances = await this.prisma.purchaseAllowance.findMany({
      where: { branchId, date: dateOnly(date), tenantId: currentUser.tenantId },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });
    return allowances.map((a) => ({
      ...a,
      availableAmount: Number(a.assignedAmount) - Number(a.spentAmount),
    }));
  }

  // Valida y descuenta cupo en la MISMA sentencia SQL: la condición
  // `assignedAmount - spentAmount >= amount` se evalúa contra el valor de
  // spentAmount vigente en la fila en el momento del UPDATE (no el que se
  // leyó antes), así que dos desembolsos concurrentes del mismo vendedor no
  // pueden sumar más que el cupo — el segundo que llega ve el spentAmount ya
  // incrementado por el primero y falla el WHERE.
  async consume(userId: string, amount: number, currentUser: AuthenticatedUser, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const today = dateOnly(new Date());
    const updated = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE purchase_allowances
      SET "spentAmount" = "spentAmount" + ${amount}, "updatedAt" = now()
      WHERE "userId" = ${userId}
        AND "tenantId" = ${currentUser.tenantId}
        AND "date" = ${today}
        AND "assignedAmount" - "spentAmount" >= ${amount}
      RETURNING id
    `);

    if (updated.length > 0) {
      return;
    }

    const allowance = await db.purchaseAllowance.findFirst({
      where: { userId, date: today, tenantId: currentUser.tenantId },
    });
    if (!allowance) {
      throw new BadRequestException(
        'No tienes cupo de compra asignado para hoy. Pide a tu jefe de sucursal que te lo asigne.',
      );
    }
    const available = Number(allowance.assignedAmount) - Number(allowance.spentAmount);
    throw new BadRequestException(
      `Cupo de compra insuficiente: disponible hoy $${available.toLocaleString('es-CO')}, se requieren $${amount.toLocaleString('es-CO')}`,
    );
  }
}
