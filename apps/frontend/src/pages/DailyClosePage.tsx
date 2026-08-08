import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';
import { useAuth } from '../lib/auth-context';

/**
 * Cierre del día: "cuánto compré / vendí / gané hoy" en una sola pantalla.
 *
 * Hoy el `DashboardPage` son 4 tarjetas sueltas y el negocio suma esto a mano
 * contrato por contrato. Todas las cifras las calcula el servidor
 * (`GET /reports/daily-close`) — aquí no se suma un peso.
 */

interface Branch {
  id: string;
  name: string;
}

interface DailyClose {
  fecha: string;
  branchId: string;
  comprasDelDia: number;
  ventasDelDia: number;
  ingresosTotalesDelDia: number;
  egresosTotalesDelDia: number;
  gastosDelDia: number;
  utilidadVentaDelDia: number;
  utilidadInteresEmpenoDelDia: number;
  utilidadEstimadaDelDia: number;
  dineroDisponible: { monto: number; cashRegisterId: string } | null;
  valorInventarioAlCierre: { disponible: number; comprometido: number; enProceso: number; total: number };
  diferenciaCajaPendiente: boolean;
}

const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
function hoyEnBogota(): string {
  return ISO_DAY.format(new Date());
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu usuario no tiene permiso para ver el cierre del día. Solo lo pueden consultar el jefe de sucursal y administración.';
    }
    if (error.status === 401) {
      return 'Tu sesión ya no es válida. Vuelve a entrar para consultar el cierre del día.';
    }
    return error.message;
  }
  return 'No se pudo consultar el cierre del día. Revisa la conexión e inténtalo de nuevo.';
}

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-gray-500">{detalle}</p>}
    </div>
  );
}

export function DailyClosePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [fecha, setFecha] = useState(hoyEnBogota());
  const [branchId, setBranchId] = useState<string>('');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches'),
    enabled: isAdmin,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['daily-close', fecha, isAdmin ? branchId : null],
    queryFn: () => {
      const params = new URLSearchParams({ date: fecha });
      if (isAdmin && branchId) {
        params.set('branchId', branchId);
      }
      return api.get<DailyClose>(`/reports/daily-close?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cierre del día</h1>
          <p className="text-sm text-gray-500">Resumen consolidado de dinero e inventario del día.</p>
        </div>
        <div className="ml-auto flex items-end gap-3">
          <label className="text-sm text-gray-700">
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
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
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{mensajeDeError(error)}</div>
      )}

      {isLoading && <p className="text-sm text-gray-500">Cargando…</p>}

      {data && (
        <>
          {data.diferenciaCajaPendiente && (
            <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              Hay una diferencia de caja sin resolver de un cierre anterior.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo="Compras del día" valor={formatCOP(data.comprasDelDia)} />
            <Tarjeta titulo="Ventas del día" valor={formatCOP(data.ventasDelDia)} />
            <Tarjeta titulo="Ingresos totales" valor={formatCOP(data.ingresosTotalesDelDia)} />
            <Tarjeta titulo="Egresos totales" valor={formatCOP(data.egresosTotalesDelDia)} />
            <Tarjeta titulo="Gastos del día" valor={formatCOP(data.gastosDelDia)} />
            <Tarjeta
              titulo="Utilidad estimada (total)"
              valor={formatCOP(data.utilidadEstimadaDelDia)}
              detalle={`Venta ${formatCOP(data.utilidadVentaDelDia)} · Interés de empeño liquidado ${formatCOP(
                data.utilidadInteresEmpenoDelDia,
              )}`}
            />
            <Tarjeta
              titulo="Dinero disponible ahora"
              valor={data.dineroDisponible ? formatCOP(data.dineroDisponible.monto) : 'Sin caja abierta'}
              detalle="Saldo corrido de la caja abierta, no solo lo de hoy."
            />
            <Tarjeta
              titulo="Valor de inventario"
              valor={formatCOP(data.valorInventarioAlCierre.total)}
              detalle={`Disponible ${formatCOP(data.valorInventarioAlCierre.disponible)} · Comprometido ${formatCOP(
                data.valorInventarioAlCierre.comprometido,
              )} · En proceso ${formatCOP(data.valorInventarioAlCierre.enProceso)}`}
            />
          </div>
        </>
      )}
    </div>
  );
}
