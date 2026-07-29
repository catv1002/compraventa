import { IsOptional, IsString } from 'class-validator';

export class LogContactDto {
  @IsString()
  channel: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
