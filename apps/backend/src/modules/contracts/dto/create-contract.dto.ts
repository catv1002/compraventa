import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ContractType } from '@prisma/client';

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
}
