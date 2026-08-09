import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Filas sueltas — llegan del CSV parseado en el navegador, no de un
// formulario, así que se validan campo por campo en el service (no todo o
// nada por `class-validator`): una fila mala no debe tumbar las 300 buenas
// del mismo archivo.
class ImportCustomerRow {
  fullName?: string;
  identificationNumber?: string;
  type?: string;
  phone?: string;
  address?: string;
  email?: string;
}

export class ImportCustomersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRow)
  rows: ImportCustomerRow[];
}
