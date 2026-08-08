import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Consulta del rastro de auditoría (`GET /audit-logs`).
 *
 * Mismo criterio que `CashStatementQueryDto`: solo filtros de lectura, la
 * paginación y el orden los decide el servidor.
 */
export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  /** Inicio del rango, inclusive. Fecha ISO (`2026-07-15`) o fecha-hora. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /**
   * Fin del rango, INCLUSIVE. Si viene solo la fecha se toma el día completo,
   * igual que en el extracto de caja (ver `endOfRange` en `cash.service.ts`).
   */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
