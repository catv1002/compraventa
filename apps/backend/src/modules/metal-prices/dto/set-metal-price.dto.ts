import { MetalType } from '@prisma/client';
import { IsEnum, IsNumber, Min } from 'class-validator';

export class SetMetalPriceDto {
  @IsEnum(MetalType)
  metal: MetalType;

  // Precio por gramo de metal 100% puro (ley 1000), en pesos.
  @IsNumber()
  @Min(0)
  pricePerGramFine: number;
}
