import { Module } from '@nestjs/common';
import { MetalPricesController } from './metal-prices.controller';
import { MetalPricesService } from './metal-prices.service';

@Module({
  controllers: [MetalPricesController],
  providers: [MetalPricesService],
  exports: [MetalPricesService],
})
export class MetalPricesModule {}
