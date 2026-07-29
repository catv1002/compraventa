import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [InventoryModule, CashModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
