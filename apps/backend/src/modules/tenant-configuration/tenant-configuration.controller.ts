import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { TenantConfigurationService } from './tenant-configuration.service';
import { UpdateTenantConfigurationDto } from './dto/update-tenant-configuration.dto';

// Parámetros de negocio del tenant (módulos activos, tasas, plazos, política de
// usura). Solo Admin: son decisiones de negocio con impacto directo en cómo se
// calcula el interés de cada contrato (ver contracts.service.ts).
@Controller('tenant-configuration')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class TenantConfigurationController {
  constructor(private readonly tenantConfigurationService: TenantConfigurationService) {}

  @Get()
  findOne(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantConfigurationService.findOne(user);
  }

  @Patch()
  @Audited('TenantConfiguration', 'TenantConfigurationUpdated', { capturePrevious: true })
  update(@Body() dto: UpdateTenantConfigurationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tenantConfigurationService.update(dto, user);
  }
}
