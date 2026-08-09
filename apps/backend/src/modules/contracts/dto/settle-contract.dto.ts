import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class SettleContractDto {
  // Control antifraude: cuando el cliente no trae el recibo físico del
  // empeño, el operador debe verificar identidad tecleando la cédula que
  // aparece en el documento presentado — el servidor la compara contra la
  // del cliente registrado en el contrato antes de permitir la liquidación.
  // Sin esto, cualquier persona que sepa el número de contrato podría
  // retirar la prenda de otro.
  @IsOptional()
  @IsBoolean()
  lostReceipt?: boolean;

  @IsOptional()
  @IsString()
  verifiedIdNumber?: string;

  /**
   * Total que la pantalla le mostró al cliente. Es una **confirmación**, no la
   * fuente del importe: el servidor calcula el total y rechaza la operación si
   * no coincide. Antes este campo era el monto real, lo que significaba que el
   * sistema cobraba lo que el operador tecleara.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedTotal?: number;

  // Retiro del bien por un tercero autorizado (boleta firmada + cédula) —
  // ver docs/01-investigacion-negocio.md §8.
  @IsOptional()
  @IsString()
  thirdPartyName?: string;

  @IsOptional()
  @IsString()
  thirdPartyIdNumber?: string;

  // Medio de pago del cobro de liquidación (capital + retroventa). Un solo
  // medio para los dos asientos: el cliente paga todo junto en el mostrador.
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
