import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingEventsListener } from './accounting-events.listener';
import { InterestAccrualScheduler } from './interest-accrual.scheduler';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, AccountingEventsListener, InterestAccrualScheduler],
  exports: [AccountingService],
})
export class AccountingModule {}
