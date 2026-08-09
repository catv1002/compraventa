import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, Min, ValidateNested } from 'class-validator';
import { InterestAccrualPolicy, InterestRounding, UsuryCapPolicy } from '@prisma/client';

// Los seis toggles de docs/12 (activeModules). Todos opcionales: un PATCH puede
// prender solo uno sin tener que repetir el resto.
export class ActiveModulesDto {
  @IsOptional()
  @IsBoolean()
  workshop?: boolean;

  @IsOptional()
  @IsBoolean()
  layaway?: boolean;

  @IsOptional()
  @IsBoolean()
  crm?: boolean;

  @IsOptional()
  @IsBoolean()
  electronicBilling?: boolean;

  @IsOptional()
  @IsBoolean()
  advancedCollections?: boolean;

  @IsOptional()
  @IsBoolean()
  consignment?: boolean;
}

// Todos los campos opcionales: el PATCH es un upsert parcial, no reemplaza la
// configuración completa cada vez.
//
// maxLegalRate y defaultMonthlyInterestRate se guardan y reciben como DECIMAL,
// no como porcentaje — 0.1950 = 19.5% efectivo anual, 0.0400 = 4% mensual. Ver
// el comentario de contracts.service.ts (monthlyToEffectiveAnnual) y el
// @default de prisma/schema.prisma. La conversión de "el usuario escribe 4"
// a 0.04 vive en el frontend, no aquí.
export class UpdateTenantConfigurationDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ActiveModulesDto)
  activeModules?: ActiveModulesDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxLegalRate?: number;

  @IsOptional()
  @IsEnum(UsuryCapPolicy)
  usuryCapPolicy?: UsuryCapPolicy;

  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultLoanablePercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultMonthlyInterestRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultTermMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  forfeitureThresholdMonths?: number;

  @IsOptional()
  @IsEnum(InterestAccrualPolicy)
  interestAccrualPolicy?: InterestAccrualPolicy;

  @IsOptional()
  @IsEnum(InterestRounding)
  interestRounding?: InterestRounding;

  @IsOptional()
  @IsInt()
  @Min(0)
  contractNumberOffset?: number;

  @IsOptional()
  @IsBoolean()
  withholdingTaxEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withholdingTaxRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withholdingTaxMinBase?: number;
}
