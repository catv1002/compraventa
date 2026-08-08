import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * Consulta del cierre del día. Fecha y sucursal opcionales: por defecto hoy y
 * la sucursal del usuario (ver `roles.guard.ts`/`current-user.decorator.ts`).
 */
export class DailyCloseQueryDto {
  /** Día a consultar, `YYYY-MM-DD`. Por defecto, hoy. */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Sucursal. Por defecto, la del usuario. Solo Admin puede pedir otra. */
  @IsOptional()
  @IsString()
  branchId?: string;
}
