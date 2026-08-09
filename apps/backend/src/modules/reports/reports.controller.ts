import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { ReportsService } from './reports.service';
import { DailyCloseQueryDto } from './dto/daily-close-query.dto';
import { RangeReportQueryDto } from './dto/range-report-query.dto';
import { toCsv } from './csv';

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

  @Get('range')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  getRangeReport(@Query() query: RangeReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getRangeReport(query, user);
  }

  // Mismo cálculo que `getRangeReport` — la exportación no recalcula nada,
  // solo cambia el formato de salida (RFC-4180 en vez de JSON).
  @Get('range/export')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  async exportRangeReport(
    @Query() query: RangeReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const report = await this.reportsService.getRangeReport(query, user);
    const csv = toCsv(
      [
        'fecha',
        'comprasDelDia',
        'ventasDelDia',
        'ingresosTotalesDelDia',
        'egresosTotalesDelDia',
        'gastosDelDia',
        'utilidadVentaDelDia',
        'utilidadInteresEmpenoDelDia',
        'utilidadEstimadaDelDia',
      ],
      report.dias,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte_${report.from}_a_${report.to}.csv"`,
    );
    res.send(csv);
  }
}
