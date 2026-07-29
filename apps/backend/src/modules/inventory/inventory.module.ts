import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { ItemsController } from './items.controller';
import { InventoryService } from './inventory.service';
import { ContractEventsListener } from './listeners/contract-events.listener';

@Module({
  controllers: [CategoriesController, ItemsController],
  providers: [InventoryService, ContractEventsListener],
  exports: [InventoryService],
})
export class InventoryModule {}
