import { IsNumber, Min } from 'class-validator';

// El cajero cuenta el efectivo físico y lo digita — la diferencia la calcula
// el servidor contra los movimientos de la caja, nunca al revés (ver
// CashService.closeRegister). Antes se aceptaba `discrepancy` directamente
// del cliente: un cajero podía escribir 0 sin haber contado nada.
export class CloseRegisterDto {
  @IsNumber()
  @Min(0)
  physicalCount: number;
}
