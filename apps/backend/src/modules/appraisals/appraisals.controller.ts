import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { AppraisalsService } from './appraisals.service';
import { CreateAppraisalDto } from './dto/create-appraisal.dto';

@Controller('items/:itemId/appraisal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppraisalsController {
  constructor(private readonly appraisalsService: AppraisalsService) {}

  @Post()
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Appraisal', 'ItemAppraised')
  create(
    @Param('itemId') itemId: string,
    @Body() dto: CreateAppraisalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appraisalsService.create(itemId, dto, user);
  }

  @Get()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findAll(@Param('itemId') itemId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appraisalsService.findByItem(itemId, user);
  }

  // Solo lectura/orientación: cualquier rol autenticado puede consultarlo, no
  // mueve dinero ni estado del artículo.
  @Get('suggested-value')
  suggestedValue(@Param('itemId') itemId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appraisalsService.suggestValue(itemId, user);
  }
}
