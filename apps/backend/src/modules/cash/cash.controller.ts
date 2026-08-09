import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { CashService } from './cash.service';
import { OpenRegisterDto } from './dto/open-register.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { CashStatementQueryDto } from './dto/cash-statement-query.dto';

@Controller('cash-registers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Post('open')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('CashRegister', 'CashRegisterOpened')
  open(@Body() dto: OpenRegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.openRegister(dto, user);
  }

  @Get('current')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findCurrentOpen(@CurrentUser() user: AuthenticatedUser) {
    return this.cashService.findOpenForBranch(user.homeBranchId);
  }

  /**
   * Extracto de caja con saldo corrido (CV-032) — pantalla C-07 del legado.
   *
   * Va declarado ANTES de `@Get(':id')`: Nest resuelve las rutas en orden de
   * declaración y `:id` capturaría la palabra "statement".
   *
   * De lectura, pero con `@Roles`: el extracto es el detalle completo del dinero
   * de la sucursal — se restringe a quien opera o supervisa la caja, no a
   * cualquier rol autenticado (un handler sin `@Roles` queda abierto a todos).
   */
  @Get('statement')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  getStatement(@Query() query: CashStatementQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.getStatement(query, user);
  }

  @Get(':id')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.findOne(id, user);
  }

  @Post(':id/movements')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('CashMovement', 'CashMovementRecorded')
  recordMovement(@Param('id') id: string, @Body() dto: RecordMovementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.recordMovement(id, dto, user);
  }

  @Post(':id/close')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('CashRegister', 'CashRegisterClosed')
  close(@Param('id') id: string, @Body() dto: CloseRegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.closeRegister(id, dto, user);
  }
}
