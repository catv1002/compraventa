import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Igual que en customers/import: filas sueltas del CSV, validadas una por una
// en el service — un peso mal escrito en la fila 40 no debe tumbar las 39
// anteriores ya válidas.
class ImportItemRow {
  /** Nombre o código legado (`legacyCode`) de la clase — se busca por ambos. */
  category?: string;
  description?: string;
  serialNumber?: string;
  weightGrams?: string;
  karats?: string;
  costBasis?: string;
}

export class ImportItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportItemRow)
  rows: ImportItemRow[];
}
