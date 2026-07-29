import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SettleContractDto {
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
}
