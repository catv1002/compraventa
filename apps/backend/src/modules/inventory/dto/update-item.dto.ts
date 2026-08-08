import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DynamicAttributeInput {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  dataType?: string;
}

// Solo permite corregir un artículo mientras sigue en `Received` — ver
// InventoryService.updateItem. Todos los campos son opcionales: se manda
// solo lo que se corrige.
export class UpdateItemDto {
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Si se manda, REEMPLAZA el conjunto completo de atributos (no hace merge
   * parcial) — se revalida contra el esquema de la categoría igual que en la
   * creación, así que un peso corregido sigue siendo obligatorio si la
   * categoría lo exige.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicAttributeInput)
  attributes?: DynamicAttributeInput[];
}
