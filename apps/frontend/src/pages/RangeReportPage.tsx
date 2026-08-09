import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, downloadFile, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';
import { useAuth } from '../lib/auth-context';

/**
 * Reportes por rango — la brecha que más se repitió en las auditorías: el
 * cierre del día (`DailyClosePage`) solo cubre un día puntual. Aquí se ve la
 * misma información día a día en el rango elegido, más exportación a CSV
 * para llevarla al contador o a Excel.
 */

interface Branch {
  id: string;
  name: string;
}

interface RangeDay {
  fecha: string;
  comprasDelDia: number;
  ventasDelDia: number;
  ingresosTotalesDelDia: number;
  egresosTotalesDelDia: number;
  gastosDelDia: number;
  utilidadVentaDelDia: number;
  utilidadInteresEmpenoDelDia: number;
  utilidadEstimadaDelDia: number;
}

interface RangeReport {
  from: string;
  to: string;
  branchId: string;
  dias: RangeDay[];
  totales: {
    comprasDelRango: number;
    ventasDelRango: number;
    ingresosTotalesDelRango: number;
    egresosTotalesDelRango: number;
    gastosDelRango: number;
    utilidadVentaDelRango: number;
    utilidadInteresEmpenoDelRango: number;
    utilidadEstimadaDelRango: number;
  };
}

const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
function hoyEnBogota(): string {
  return ISO_DAY.format(new Date());
}
function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ISO_DAY.format(d);
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'No se pudo consultar el reporte. Revisa la conexión e inténtalo de nuevo.';
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">{valor}</p>
    </div>
  );
}

export function RangeReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [from, setFrom] = useState(haceDias(6));
  const [to, setTo] = useState(hoyEnBogota());
  const [branchId, setBranchId] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches'),
    enabled: isAdmin,
  });

  const params = new URLSearchParams({ from, to });
  if (isAdmin && branchId) params.set('branchId', branchId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['range-report', from, to, isAdmin ? branchId : null],
    queryFn: () => api.get<RangeReport>(`/reports/range?${params.toString()}`),
  });

  async function exportar() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadFile(`/reports/range/export?${params.toString()}`, `reporte_${from}_a_${to}.csv`);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'No se pudo exportar el reporte');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reportes por rango</h1>
          <p className="text-sm text-gray-500">Compras, ventas y utilidad día a día — no solo hoy.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="text-sm text-gray-700">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded border border-gray-300 px-2 py-1"
            />
          </label>
          {isAdmin && (
            <label className="text-sm text-gray-700">
              Sucursal
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1 block rounded border border-gray-300 px-2 py-1"
              >
                <option value="">La mía</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={exportar}
            disabled={downloading || !data}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {downloading ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{mensajeDeError(error)}</div>
      )}
      {downloadError && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{downloadError}</div>
      )}
      {isLoading && <p className="text-sm text-gray-500">Cargando…</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo="Compras del rango" valor={formatCOP(data.totales.comprasDelRango)} />
            <Tarjeta titulo="Ventas del rango" valor={formatCOP(data.totales.ventasDelRango)} />
            <Tarjeta titulo="Gastos del rango" valor={formatCOP(data.totales.gastosDelRango)} />
            <Tarjeta titulo="Utilidad estimada del rango" valor={formatCOP(data.totales.utilidadEstimadaDelRango)} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Compras</th>
                  <th className="px-3 py-2 text-right">Ventas</th>
                  <th className="px-3 py-2 text-right">Gastos</th>
                  <th className="px-3 py-2 text-right">Utilidad venta</th>
                  <th className="px-3 py-2 text-right">Utilidad empeño</th>
                  <th className="px-3 py-2 text-right">Utilidad total</th>
                </tr>
              </thead>
              <tbody>
                {data.dias.map((d) => (
                  <tr key={d.fecha} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{d.fecha}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCOP(d.comprasDelDia)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCOP(d.ventasDelDia)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCOP(d.gastosDelDia)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCOP(d.utilidadVentaDelDia)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCOP(d.utilidadInteresEmpenoDelDia)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCOP(d.utilidadEstimadaDelDia)}
                    </td>
                  </tr>
                ))}
                {data.dias.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                      Sin datos en este rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
