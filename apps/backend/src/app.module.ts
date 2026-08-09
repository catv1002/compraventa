import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
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
import { PurchaseAllowancesModule } from './modules/purchase-allowances/purchase-allowances.module';
import { UsersModule } from './modules/users/users.module';
import { TenantConfigurationModule } from './modules/tenant-configuration/tenant-configuration.module';
import { MetalPricesModule } from './modules/metal-prices/metal-prices.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
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
    PurchaseAllowancesModule,
    UsersModule,
    TenantConfigurationModule,
    MetalPricesModule,
    ReportsModule,
  ],
})
export class AppModule {}
