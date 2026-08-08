import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class PayInstallmentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  cashRegisterId: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
