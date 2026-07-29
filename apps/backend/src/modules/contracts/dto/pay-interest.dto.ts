import { IsInt, IsString, Min } from 'class-validator';

/**
 * Pago de intereses (RN-04).
 *
 * El operador elige **cuántos meses** paga el cliente, no cuánta plata entrega:
 * el importe lo calcula el servidor. Ese cambio es el que elimina la digitación
 * de montos que hoy produce los descuadres de caja del sistema legado
 * (ver docs/11-levantamiento-campo-carrera113.md §3.2).
 */
export class PayInterestDto {
  @IsInt()
  @Min(1)
  months: number;

  @IsString()
  cashRegisterId: string;
}
