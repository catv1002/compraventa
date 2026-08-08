import { Module } from '@nestjs/common';
import { PurchaseAllowancesController } from './purchase-allowances.controller';
import { PurchaseAllowancesService } from './purchase-allowances.service';

@Module({
  controllers: [PurchaseAllowancesController],
  providers: [PurchaseAllowancesService],
  exports: [PurchaseAllowancesService],
})
export class PurchaseAllowancesModule {}
