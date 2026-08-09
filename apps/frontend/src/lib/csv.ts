/**
 * Parser de CSV mínimo, sin dependencia externa: separador coma, encabezado
 * en la primera línea, soporta campos entre comillas dobles (con comillas
 * escapadas `""`) — lo suficiente para exportar desde Excel/Sheets e
 * importar de vuelta. No soporta separador `;` (Excel en español a veces lo
 * usa) — si hace falta, se agrega, pero hoy no complicamos el parser por un
 * caso que no se ha visto.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
