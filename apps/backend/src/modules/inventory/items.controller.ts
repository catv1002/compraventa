import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ItemStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { InventoryService } from './inventory.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ImportItemsDto } from './dto/import-items.dto';

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

  @Post('import')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('Item', 'ItemsImported')
  importRows(@Body() dto: ImportItemsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.importItems(dto, user);
  }

  @Get()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ItemStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.inventoryService.listItems(user, { status, categoryId });
  }

  /**
   * Búsqueda exacta por código escaneado (físico o por cámara) — a diferencia
   * de `GET /items` + filtro en el cliente, esto resuelve del lado servidor
   * contra `qrCode`/`serialNumber`, sin depender de que el artículo ya esté
   * en la página cargada. Declarado ANTES de `:id` por el mismo motivo que
   * `cash-registers/statement`: Nest resuelve rutas en orden de declaración.
   */
  @Get('lookup/:code')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  lookupByCode(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.findByCode(code, user);
  }

  @Get(':id')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('Item', 'ItemUpdated', { capturePrevious: true })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.updateItem(id, dto, user);
  }

  @Post(':id/restock')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('Item', 'ItemRestocked', { capturePrevious: true })
  restock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.restockItem(id, user);
  }
}
