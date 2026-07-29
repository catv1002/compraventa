import { IsEmail, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerType } from '@prisma/client';

class ReferenceInput {
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  relationship?: string;
}

export class CreateCustomerDto {
  @IsEnum(CustomerType)
  type: CustomerType;

  @IsString()
  fullName: string;

  @IsString()
  identificationNumber: string;

  @IsString()
  phone: string;

  @IsString()
  address: string;

  @IsEmail()
  email: string;

  // Contacto de referencia — opcional, para ubicar al cliente si no responde
  // durante la vigencia de un contrato. Ver docs/03-dominios-ddd.md (2. Clientes).
  @IsOptional()
  @ValidateNested()
  @Type(() => ReferenceInput)
  reference?: ReferenceInput;
}
