import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MockDianProvider } from './mock-dian.provider';
import { DIAN_PROVIDER } from './dian-provider.interface';

@Module({
  controllers: [BillingController],
  providers: [BillingService, { provide: DIAN_PROVIDER, useClass: MockDianProvider }],
})
export class BillingModule {}
