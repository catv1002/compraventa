import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DynamicAttributeInput {
  @IsString()
  key: string;

  /**
   * Siempre string: el tipo real lo declara el `attributeSchema` de la
   * categoría y el service convierte y normaliza
   * (`attributes/attribute-validator.ts`).
   */
  @IsString()
  value: string;

  /**
   * Opcional y **meramente informativo**: la fuente de verdad del tipo es el
   * esquema de la categoría, no lo que declare quien llama. Se conserva para no
   * romper a los clientes que ya lo enviaban.
   */
  @IsOptional()
  @IsString()
  dataType?: string;
}

export class CreateItemDto {
  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  /**
   * Novedades de la pieza en texto libre ("tiene piedra roja", "está partida"),
   * que es como el legado usa `Descripción Adicional` (C-04). La **clase** de la
   * joya NO va aquí: se elige del catálogo preparametrizado y viaja en
   * `categoryId` (RN-20, CV-020).
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Atributos dinámicos de la pieza (peso, quilataje…). Se validan contra el
   * esquema efectivo de la categoría antes de persistir: un atributo no
   * declarado, o un obligatorio ausente, hace fallar la petición.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicAttributeInput)
  attributes?: DynamicAttributeInput[];
}
