import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ContractType, PaymentMethod } from '@prisma/client';

export class CreateContractDto {
  @IsEnum(ContractType)
  contractType: ContractType;

  @IsString()
  customerId: string;

  @IsString()
  itemId: string;

  // Requerido para Pawn/DirectPurchase/Sale (hay movimiento de caja inmediato).
  // Layaway no lo requiere al crear — los pagos llegan luego vía /installment.
  @IsOptional()
  @IsString()
  cashRegisterId?: string;

  @IsNumber()
  @Min(0.01)
  principalAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  interestRate?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Solo relevante cuando el contrato mueve caja de inmediato (DirectPurchase,
  // Sale). Un Pawn se desembolsa después vía POST :id/disburse, que lleva su
  // propio paymentMethod. Default Cash si se omite.
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // Solo tiene sentido en ContractType.Sale: cuánto se rebajó del precio de
  // lista para llegar a `principalAmount`. Informativo — el dinero cobrado
  // sigue siendo `principalAmount`, no `principalAmount - discountAmount`.
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
