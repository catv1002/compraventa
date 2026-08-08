import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { ReportsService } from './reports.service';
import { DailyCloseQueryDto } from './dto/daily-close-query.dto';

/**
 * Reportes de negocio de consulta pura (sin escritura). Restringido a jefe de
 * sucursal/Admin: es el resumen de dinero del día, no una pantalla operativa
 * de mostrador (a diferencia de `cash-registers`, aquí no entra SalesAdvisor).
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily-close')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  getDailyClose(@Query() query: DailyCloseQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getDailyClose(query, user);
  }
}
