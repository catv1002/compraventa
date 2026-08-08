import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class ReturnSaleDto {
  @IsString()
  cashRegisterId: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
