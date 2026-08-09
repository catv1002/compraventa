import { Injectable } from '@nestjs/common';
import { InterestAccrualPolicy, InterestRounding, UsuryCapPolicy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { UpdateTenantConfigurationDto } from './dto/update-tenant-configuration.dto';

// Mismos valores que los @default(...) de prisma/schema.prisma. Un tenant que
// nunca corrió el seed no debe ver un 404 al abrir la pantalla de
// configuración — debe ver estos valores, que son exactamente lo que Prisma
// pondría si se creara el registro ahora mismo.
const DEFAULT_CONFIGURATION = {
  activeModules: {
    workshop: false,
    layaway: false,
    crm: false,
    electronicBilling: false,
    advancedCollections: false,
    consignment: false,
  },
  maxLegalRate: 0.195,
  usuryCapPolicy: UsuryCapPolicy.Warn,
  gracePeriodDays: 30,
  defaultLoanablePercentage: 60.0,
  defaultMonthlyInterestRate: 0.04,
  defaultTermMonths: 6,
  forfeitureThresholdMonths: 8,
  interestAccrualPolicy: InterestAccrualPolicy.FullMonthCeil,
  interestRounding: InterestRounding.NearestHundred,
  contractNumberOffset: 0,
  withholdingTaxEnabled: false,
  withholdingTaxRate: 0,
  withholdingTaxMinBase: 0,
};

@Injectable()
export class TenantConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(currentUser: AuthenticatedUser) {
    const config = await this.prisma.tenantConfiguration.findUnique({
      where: { tenantId: currentUser.tenantId },
    });

    if (config) {
      return config;
    }

    // Sin registro todavía: valores por defecto sin id/tenantId reales, para
    // que el formulario tenga algo con qué prellenarse.
    return { id: null, tenantId: currentUser.tenantId, ...DEFAULT_CONFIGURATION };
  }

  async update(dto: UpdateTenantConfigurationDto, currentUser: AuthenticatedUser) {
    const data: Record<string, unknown> = { ...dto };

    if (dto.activeModules) {
      // activeModules es un único campo JSON: un PATCH que solo manda
      // `{ workshop: true }` no debe apagar los otros módulos que ya estaban
      // prendidos, así que se combina con lo que hay guardado (o los defaults).
      const existing = await this.findOne(currentUser);
      data.activeModules = { ...(existing.activeModules as object), ...dto.activeModules };
    }

    return this.prisma.tenantConfiguration.upsert({
      where: { tenantId: currentUser.tenantId },
      update: data,
      create: { tenantId: currentUser.tenantId, ...data },
    });
  }
}
