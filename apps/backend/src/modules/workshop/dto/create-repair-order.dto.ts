import { IsOptional, IsString } from 'class-validator';

export class CreateRepairOrderDto {
  @IsString()
  itemId: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;
}
