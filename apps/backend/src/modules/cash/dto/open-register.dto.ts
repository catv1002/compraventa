import { IsNumber, Min } from 'class-validator';

export class OpenRegisterDto {
  @IsNumber()
  @Min(0)
  baseAmount: number;
}
