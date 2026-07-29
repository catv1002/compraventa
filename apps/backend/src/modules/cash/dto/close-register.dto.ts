import { IsNumber } from 'class-validator';

export class CloseRegisterDto {
  @IsNumber()
  discrepancy: number;
}
