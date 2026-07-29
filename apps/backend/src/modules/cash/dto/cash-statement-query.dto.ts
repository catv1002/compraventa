import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * Consulta del extracto de caja (CV-032), la pantalla C-07 del legado.
 *
 * Solo rango y caja/sucursal: ningún importe ni saldo entra por aquí. El saldo
 * corrido lo arrastra el servidor desde el saldo inicial de la caja — si lo
 * acumulara el cliente, el número con el que el negocio cuadra el día
 * dependería de qué pantalla lo abrió.
 */
export class CashStatementQueryDto {
  /** Inicio del rango, inclusive. Fecha ISO (`2026-07-15`) o fecha-hora. */
  @IsDateString()
  from: string;

  /**
   * Fin del rango, INCLUSIVE. Si viene solo la fecha se toma el día completo:
   * el operador que consulta "del 15 al 15" espera ver el 15 entero, no las
   * cero horas del 15.
   */
  @IsDateString()
  to: string;

  /** Sucursal. Por defecto, la del usuario que consulta. */
  @IsOptional()
  @IsString()
  branchId?: string;

  /** Restringe a una sola caja del rango, en vez de a toda la sucursal. */
  @IsOptional()
  @IsString()
  cashRegisterId?: string;
}
