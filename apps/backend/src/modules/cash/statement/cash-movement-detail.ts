/**
 * Terminología del libro de caja (RN-25).
 *
 * El detalle de un asiento NO usa el idioma del mostrador. La pantalla le dice
 * al operador "intereses", "abono", "liquidar" porque es lo que el operador y el
 * cliente entienden (docs/11-levantamiento-campo-carrera113.md §5); el libro y
 * el contrato impreso dicen "recompra", "retroventa", "capital liquidación".
 *
 * Importa por una razón concreta y no cosmética: la operación es una compraventa
 * con pacto de retroventa (arts. 1939-1943 C.C.). Bajo el principio de sustancia
 * sobre forma, un juez puede recalificarla como mutuo con prenda —con el tope de
 * usura y las consecuencias que eso arrastra— si el propio sistema documenta la
 * operación como un préstamo con intereses. El sistema legado ya hace esta
 * separación; hasta CV-032 el producto nuevo no tenía ninguna capa que la
 * produjera. Ver la skill contexto-negocio-colombia §1-§3.
 *
 * Textos tomados literalmente de la pantalla C-07 del legado
 * (docs/fuentes/2026-07-capturas-plus-cv-carrera113.md). Módulo puro: sin
 * Prisma, sin Nest, para poder probarlo y para que el vocabulario viva en un
 * solo sitio en vez de repartido en plantillas de string por todo el código.
 */

/** Documento visible del asiento: el consecutivo de negocio del contrato. */
export function documentNumberOf(contractNumber: number | string): string {
  return String(contractNumber);
}

/**
 * Desembolso al abrir el contrato — la única salida de efectivo habitual.
 * Legado: `CONTRATO # 92748` con 250.000 al crédito.
 */
export function disbursementDetail(contractNumber: number | string): string {
  return `CONTRATO # ${contractNumber}`;
}

/**
 * Capital devuelto al liquidar. Legado: `CAPITAL LIQUIDACION DEL CONTRATO # 92627`
 * por 1.800.000 al débito.
 */
export function settlementPrincipalDetail(contractNumber: number | string): string {
  return `CAPITAL LIQUIDACION DEL CONTRATO # ${contractNumber}`;
}

/**
 * Sobrecosto cobrado al liquidar — el ingreso financiero, que va SIEMPRE en su
 * propio asiento (RN-26). Legado: contrato 92627, 72.000 al débito a las 16:11,
 * fila distinta de la del capital pese a ser el mismo minuto.
 *
 * El texto de la captura se lee `RETROVENTA O PAGADO POR LIQUIDACION DEL
 * CONTRATO # …`; la lectura del "O" intermedio es dudosa y lo más probable es
 * que sea el número de contrato pegado al texto. Se adopta la forma sin la "O",
 * que es la que pidió el negocio. **[por confirmar]** contra una captura legible.
 */
export function settlementSurchargeDetail(contractNumber: number | string): string {
  return `RETROVENTA PAGADO POR LIQUIDACION DEL CONTRATO # ${contractNumber}`;
}

/**
 * Sobrecosto cobrado al actualizar/renovar el contrato — lo más frecuente del
 * día observado. Legado: `RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 92657`.
 *
 * Todavía sin usar desde `contracts`: `renew()` no registra movimiento de caja
 * hoy (ver skill contabilidad-y-caja §8.6). Vive aquí para que cuando se cierre
 * ese hueco el vocabulario ya esté en un solo sitio.
 */
export function renewalSurchargeDetail(contractNumber: number | string): string {
  return `RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # ${contractNumber}`;
}

/** Abono a capital. Legado: `ABONO A CAPITAL DEL CONTRATO # 92659`. */
export function principalPaymentDetail(contractNumber: number | string): string {
  return `ABONO A CAPITAL DEL CONTRATO # ${contractNumber}`;
}

/**
 * Detalle de último recurso, cuando quien escribe el asiento no aportó uno.
 *
 * No inventa terminología legal: dice qué originó el movimiento y nada más. Un
 * asiento que declara no saber su concepto es auditable; uno que afirma
 * "CAPITAL LIQUIDACION" sin que nadie lo haya escrito, no.
 *
 * **[por confirmar]**: existe solo como red de seguridad mientras las rutas de
 * desembolso, pago de intereses y abono a capital de `contracts.service.ts`
 * sigan sin pasar su detalle explícito (quedaron fuera del alcance de CV-032).
 * Cuando todas lo pasen, esta función debería dejar de aparecer en el extracto,
 * y `detail` puede volverse obligatorio en `RecordMovementDto`.
 */
export function fallbackDetail(sourceType: string, documentNumber?: string | null): string {
  const origen = sourceType.trim().toUpperCase() || 'MOVIMIENTO';
  return documentNumber
    ? `MOVIMIENTO ${origen} # ${documentNumber}`
    : `MOVIMIENTO ${origen}`;
}
