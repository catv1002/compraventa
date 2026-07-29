import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingEventsListener } from './accounting-events.listener';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, AccountingEventsListener],
  exports: [AccountingService],
})
export class AccountingModule {}
