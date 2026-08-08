import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

// Una línea del ticket = un artículo = un Contract tipo Sale (Option B: ver
// el comentario de `Contract.saleTicketId` en schema.prisma). No es un DTO de
// Contract reducido a propósito: el ticket no expone contractType/customerId
// por línea, esos son del ticket completo.
export class SaleTicketLineDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0.01)
  principalAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class CreateSaleTicketDto {
  @IsString()
  customerId: string;

  @IsString()
  cashRegisterId: string;

  // Un solo medio de pago para todo el ticket — cobro de mostrador en un solo
  // acto, no pago dividido por artículo (fuera de alcance).
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleTicketLineDto)
  items: SaleTicketLineDto[];
}
