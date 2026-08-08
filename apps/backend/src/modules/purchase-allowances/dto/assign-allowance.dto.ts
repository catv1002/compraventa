import { IsDateString, IsNumber, IsUUID, Min } from 'class-validator';

export class AssignAllowanceDto {
  @IsUUID()
  userId: string;

  // Fecha calendario del cupo (YYYY-MM-DD). Por defecto el frontend manda hoy,
  // pero se admite adelantar el cupo de mañana desde ya.
  @IsDateString()
  date: string;

  @IsNumber()
  @Min(0)
  assignedAmount: number;
}
