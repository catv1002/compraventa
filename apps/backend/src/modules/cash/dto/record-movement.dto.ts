import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class RecordMovementDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  // El importe es siempre POSITIVO: la dirección del movimiento la lleva `type`
  // (CashIn = débito/entra, CashOut = crédito/sale), nunca el signo del monto.
  // Ver RN-24 y `statement/cash-statement.ts`.
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  sourceType: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  // Columna "Documento" del extracto: el consecutivo de negocio del contrato
  // (`Contract.contractNumber`). Lo resuelve quien origina el movimiento, porque
  // caja no debe consultar la tabla de contratos para escribir su propio libro.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string;

  // Columna "Detalle", con la terminología legal del libro (RN-25). Es el único
  // dato del asiento que no se puede reconstruir después: si no se guarda al
  // escribir, se pierde. Los constructores están en
  // `statement/cash-movement-detail.ts` — no compongas el texto a mano.
  //
  // Opcional en el DTO y no obligatorio [por confirmar]: las rutas de
  // desembolso, pago de intereses y abono a capital de contracts todavía no lo
  // pasan y quedaron fuera del alcance de CV-032. Mientras tanto el servicio
  // rellena un detalle de último recurso. Debe volverse obligatorio en cuanto
  // todas las rutas lo aporten.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;
}
