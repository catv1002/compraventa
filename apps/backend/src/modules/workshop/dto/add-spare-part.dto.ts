import { IsNumber, IsString, Min } from 'class-validator';

export class AddSparePartDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  cost: number;
}
