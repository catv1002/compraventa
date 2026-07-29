import { IsObject, IsOptional, IsString } from 'class-validator';
import { CategoryAttributeSchema } from '../attributes/attribute-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  /**
   * Categoría padre. Las 15 clases de joya cuelgan de la línea "Oro" y heredan
   * su esquema de atributos — ver la decisión de modelado en `jewelry-catalog.ts`.
   */
  @IsOptional()
  @IsString()
  parentCategoryId?: string;

  /**
   * Esquema de atributos de la categoría. Lo que no encaje con
   * `CategoryAttributeSchema` se descarta al leerlo (`parseAttributeSchema`),
   * de modo que un esquema corrupto se comporta como uno vacío en vez de
   * tumbar el alta de artículos.
   */
  @IsOptional()
  @IsObject()
  attributeSchema?: CategoryAttributeSchema;
}
