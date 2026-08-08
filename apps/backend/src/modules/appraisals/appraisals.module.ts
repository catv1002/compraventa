import { Module } from '@nestjs/common';
import { AppraisalsController } from './appraisals.controller';
import { AppraisalsService } from './appraisals.service';
import { InventoryModule } from '../inventory/inventory.module';
import { MetalPricesModule } from '../metal-prices/metal-prices.module';

@Module({
  imports: [InventoryModule, MetalPricesModule],
  controllers: [AppraisalsController],
  providers: [AppraisalsService],
})
export class AppraisalsModule {}
