/**
 * Formato de las cifras que ve el operador de mostrador.
 *
 * Existe porque hasta ahora cada pantalla formateaba los pesos a su manera
 * (`ContractsPage` con `Intl.NumberFormat`, el resto concatenando `'$'` con
 * `toLocaleString`), de modo que el mismo importe se veía distinto según dónde
 * apareciera. Toda cifra en pesos debe pasar por `formatCOP`.
 */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * Acepta `number` (endpoints calculados, p. ej. `/contracts/:id/quote`) y
 * `string` (entidades Prisma, que serializan `Decimal` como texto).
 */
export function formatCOP(value: number | string): string {
  return COP.format(Number(value));
}

// Las fechas del backend son DateTime UTC a medianoche. Formatearlas en la zona
// local (UTC-5 en Colombia) las corre un día hacia atrás y el operador le
// diría al cliente una fecha de corte equivocada; de ahí el timeZone fijo.
const DATE = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDate(value: string | Date): string {
  return DATE.format(new Date(value));
}
