import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAppraisalDto {
  @IsNumber()
  @Min(0)
  appraisedValue: number;

  @IsNumber()
  @Min(0)
  loanablePercentage: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
