import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RangeReportQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
