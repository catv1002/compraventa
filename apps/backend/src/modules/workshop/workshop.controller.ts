import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { WorkshopService } from './workshop.service';
import { CreateRepairOrderDto } from './dto/create-repair-order.dto';
import { AddSparePartDto } from './dto/add-spare-part.dto';

@Controller('repair-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkshopController {
  constructor(private readonly workshopService: WorkshopService) {}

  @Post()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('RepairOrder', 'ItemSentToWorkshop')
  create(@Body() dto: CreateRepairOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workshopService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.workshopService.findAll(user);
  }

  @Post(':id/spare-parts')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('RepairOrder', 'SparePartAdded')
  addSparePart(@Param('id') id: string, @Body() dto: AddSparePartDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workshopService.addSparePart(id, dto, user);
  }

  @Post(':id/complete')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('RepairOrder', 'RepairCompleted')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workshopService.complete(id, user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('RepairOrder', 'RepairCancelled')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workshopService.cancel(id, user);
  }
}
