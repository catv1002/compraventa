import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './shared/audit/audit.module';
import { SecurityModule } from './modules/security/security.module';
import { CustomersModule } from './modules/customers/customers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AppraisalsModule } from './modules/appraisals/appraisals.module';
import { CashModule } from './modules/cash/cash.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { BranchesModule } from './modules/branches/branches.module';
import { WorkshopModule } from './modules/workshop/workshop.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuditModule,
    SecurityModule,
    CustomersModule,
    InventoryModule,
    AppraisalsModule,
    CashModule,
    ContractsModule,
    BranchesModule,
    WorkshopModule,
    CollectionsModule,
    AccountingModule,
    BillingModule,
  ],
})
export class AppModule {}
