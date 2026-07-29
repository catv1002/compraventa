import { IsNumber, IsString, Min } from 'class-validator';

export class PayInstallmentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  cashRegisterId: string;
}
