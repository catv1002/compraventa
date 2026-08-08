import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/**
 * Abono a capital de un contrato de empeño (RN-03 / CV-007).
 *
 * Solo se acepta si el contrato está al día en intereses — es la regla que la
 * empleada de la Carrera 113 describe como el "plus" del sistema actual:
 * *"tengo que estar al día de intereses para poder realizar el abono"*.
 */
export class PayPrincipalDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  cashRegisterId: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
