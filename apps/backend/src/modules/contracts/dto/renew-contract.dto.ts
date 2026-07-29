import { IsDateString } from 'class-validator';

/**
 * Renovación = extender el vencimiento. El pago de intereses es una operación
 * distinta (`POST /contracts/:id/interest`) y por eso este DTO ya no lleva
 * importe: renovar y pagar intereses dejaron de ser lo mismo (CV-009).
 */
export class RenewContractDto {
  @IsDateString()
  newDueDate: string;
}
