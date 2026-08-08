import { Module } from '@nestjs/common';
import { TenantConfigurationController } from './tenant-configuration.controller';
import { TenantConfigurationService } from './tenant-configuration.service';

@Module({
  controllers: [TenantConfigurationController],
  providers: [TenantConfigurationService],
})
export class TenantConfigurationModule {}
