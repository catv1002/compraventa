import { ChangeEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { parseCsv } from '../lib/csv';

/**
 * Migración masiva desde el sistema actual — clientes e inventario, por CSV.
 *
 * El archivo se parsea en el navegador (no se sube a ningún lado); solo las
 * filas ya convertidas a JSON viajan al backend. Fila por fila: un dato malo
 * en una fila no descarta el resto del archivo, y el resultado por fila
 * queda visible para corregir y reintentar solo lo que falló.
 */

type Tab = 'clientes' | 'inventario';

interface ImportResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  identificationNumber?: string;
  itemId?: string;
  reason?: string;
}

const CUSTOMERS_TEMPLATE = 'fullName,identificationNumber,type,phone,address,email\n';
const ITEMS_TEMPLATE = 'category,description,serialNumber,weightGrams,karats,costBasis\n';

const CUSTOMERS_COLUMNS = ['fullName', 'identificationNumber', 'type', 'phone', 'address', 'email'];
const ITEMS_COLUMNS = ['category', 'description', 'serialNumber', 'weightGrams', 'karats', 'costBasis'];

function downloadTemplate(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ResultBadge({ status }: { status: ImportResult['status'] }) {
  const styles: Record<ImportResult['status'], string> = {
    created: 'bg-emerald-100 text-emerald-800',
    skipped: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-700',
  };
  const labels: Record<ImportResult['status'], string> = {
    created: 'Creado',
    skipped: 'Omitido',
    error: 'Error',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

export function ImportPage() {
  const [tab, setTab] = useState<Tab>('clientes');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const columns = tab === 'clientes' ? CUSTOMERS_COLUMNS : ITEMS_COLUMNS;

  function reset() {
    setFileName(null);
    setRows([]);
    setParseError(null);
    setResults(null);
  }

  function handleTabChange(next: Tab) {
    setTab(next);
    reset();
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResults(null);
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError('El archivo no tiene filas de datos (solo encabezado, o está vacío).');
        setRows([]);
        return;
      }
      const missing = columns.filter((c) => !(c in parsed[0]));
      if (missing.length > 0) {
        setParseError(`Faltan columnas en el encabezado: ${missing.join(', ')}`);
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch {
      setParseError('No se pudo leer el archivo. ¿Es un CSV de texto plano?');
      setRows([]);
    }
  }

  const importMutation = useMutation({
    mutationFn: () => {
      const path = tab === 'clientes' ? '/customers/import' : '/items/import';
      return api.post<ImportResult[]>(path, { rows });
    },
    onSuccess: setResults,
  });

  const summary = results
    ? {
        creados: results.filter((r) => r.status === 'created').length,
        omitidos: results.filter((r) => r.status === 'skipped').length,
        errores: results.filter((r) => r.status === 'error').length,
      }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Migración de datos</h1>
        <p className="text-sm text-gray-500">
          Trae clientes o inventario desde tu sistema actual con un archivo CSV. Descarga la plantilla, llénala y
          súbela — cada fila se procesa por separado, así que una fila mala no bota el resto del archivo.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleTabChange('clientes')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'clientes' ? 'bg-slate-900 text-white' : 'border border-gray-300 text-gray-700'}`}
        >
          Clientes
        </button>
        <button
          onClick={() => handleTabChange('inventario')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'inventario' ? 'bg-slate-900 text-white' : 'border border-gray-300 text-gray-700'}`}
        >
          Inventario
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <button
          onClick={() =>
            downloadTemplate(
              tab === 'clientes' ? 'plantilla_clientes.csv' : 'plantilla_inventario.csv',
              tab === 'clientes' ? CUSTOMERS_TEMPLATE : ITEMS_TEMPLATE,
            )
          }
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Descargar plantilla
        </button>
        <label className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer">
          Elegir archivo CSV
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </label>
        {fileName && <span className="text-sm text-gray-500">{fileName} · {rows.length} fila(s)</span>}
        {tab === 'inventario' && (
          <p className="w-full text-xs text-gray-500">
            <span className="font-medium">category</span> acepta el nombre de la clase o su código legado (ej. 00102).
            <span className="font-medium"> weightGrams</span>/<span className="font-medium">karats</span> solo son
            obligatorios si la clase los exige (las clases de Oro sí).
          </p>
        )}
      </div>

      {parseError && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{parseError}</div>
      )}

      {rows.length > 0 && !results && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-400">{i + 2}</td>
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2 text-gray-700">{row[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
                Mostrando las primeras 20 de {rows.length} filas — se importan todas.
              </p>
            )}
          </div>

          {importMutation.isError && (
            <p className="text-sm text-red-600">{(importMutation.error as ApiError).message}</p>
          )}

          <button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {importMutation.isPending ? 'Importando…' : `Importar ${rows.length} fila(s)`}
          </button>
        </div>
      )}

      {results && summary && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-700">{summary.creados} creado(s)</span>
            <span className="text-amber-700">{summary.omitidos} omitido(s)</span>
            <span className="text-red-700">{summary.errores} con error</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-500">{r.row}</td>
                    <td className="px-3 py-2"><ResultBadge status={r.status} /></td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.reason ?? r.identificationNumber ?? r.itemId ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={reset} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
