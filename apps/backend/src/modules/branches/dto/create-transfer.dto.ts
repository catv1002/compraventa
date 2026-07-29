import { IsString } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  itemId: string;

  @IsString()
  toBranchId: string;
}
