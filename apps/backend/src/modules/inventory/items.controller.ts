import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ItemStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { InventoryService } from './inventory.service';
import { CreateItemDto } from './dto/create-item.dto';

@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('Item', 'ItemReceived')
  create(@Body() dto: CreateItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.createItem(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ItemStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.inventoryService.listItems(user, { status, categoryId });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.findOne(id, user);
  }
}
