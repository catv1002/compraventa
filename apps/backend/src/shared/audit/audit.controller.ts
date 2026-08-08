import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../modules/security/jwt-auth.guard';
import { RolesGuard } from '../../modules/security/roles.guard';
import { Roles } from '../../modules/security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../modules/security/current-user.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

/**
 * Fin de rango INCLUSIVO — mismo criterio que `endOfRange` en
 * `cash.service.ts`: si `value` trae solo la fecha se extiende hasta el
 * último milisegundo del día.
 */
function endOfRange(value: string): Date {
  const parsed = new Date(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  if (isDateOnly) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

/**
 * Lectura del rastro de auditoría que `AuditInterceptor` viene escribiendo
 * (ver docs/05-multisucursal-auditoria.md). Vive en el mismo módulo que la
 * escritura porque es infraestructura transversal, no un módulo de dominio
 * propio — no toca `audit.service.ts` ni el interceptor.
 *
 * Solo Admin: el `AuditLog` puede contener el estado previo/nuevo completo
 * de Customer, User, etc. (ver `loadSnapshot`), así que es tan sensible como
 * los datos que audita.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(@Query() query: AuditLogQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    // AuditLog no tiene tenantId propio (ver schema.prisma): se escala al
    // tenant del usuario autor a través de la relación `user`. Un registro sin
    // `userId` (no debería darse: el interceptor siempre lo llena desde el
    // request autenticado) quedaría fuera de cualquier tenant y por lo tanto
    // fuera de esta consulta, nunca visible a otro tenant por accidente.
    const where: Prisma.AuditLogWhereInput = {
      user: { tenantId: user.tenantId },
    };

    if (query.entity) where.entity = query.entity;
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: endOfRange(query.to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Lista de entidades distintas presentes hoy en la tabla, para un filtro. */
  @Get('entities')
  async entities(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.prisma.auditLog.findMany({
      where: { user: { tenantId: user.tenantId } },
      select: { entity: true },
      distinct: ['entity'],
      orderBy: { entity: 'asc' },
    });
    return rows.map((row) => row.entity);
  }
}
