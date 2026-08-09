// Generador de CSV mínimo, sin dependencia externa — solo lo que este módulo
// necesita: encabezados fijos + filas de valores primitivos. Escapa comillas
// dobles y envuelve en comillas cualquier valor con coma/salto de línea/comilla,
// que es la regla estándar de CSV (RFC 4180).
function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(escapeCsvValue).join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(','));
  return [headerLine, ...lines].join('\r\n');
}
