import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { PurchaseAllowancesService } from './purchase-allowances.service';
import { AssignAllowanceDto } from './dto/assign-allowance.dto';

@Controller('purchase-allowances')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseAllowancesController {
  constructor(private readonly purchaseAllowancesService: PurchaseAllowancesService) {}

  @Post()
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('PurchaseAllowance', 'PurchaseAllowanceAssigned')
  assign(@Body() dto: AssignAllowanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseAllowancesService.assign(dto, user);
  }

  // Cualquier rol autenticado consulta SU PROPIO cupo — no requiere @Roles
  // porque el userId sale del token, no de un parámetro que pudiera apuntar
  // a otra persona.
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.purchaseAllowancesService.getFor(user.userId, date ? new Date(date) : new Date(), user);
  }

  @Get('branch/:branchId/candidates')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  listCandidates(@Param('branchId') branchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseAllowancesService.listCandidates(branchId, user);
  }

  @Get('branch/:branchId')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  listForBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.purchaseAllowancesService.listForBranch(branchId, date ? new Date(date) : new Date(), user);
  }
}
