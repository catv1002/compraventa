import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';

/**
 * Rastro de auditoría (`GET /audit-logs`) — cada cambio sensible que
 * `AuditInterceptor` viene registrando (Customer, Contract, Branch, User,
 * TenantConfiguration, etc.) pero que hasta ahora nadie podía leer. Solo
 * Admin: puede contener el estado previo/nuevo completo de entidades
 * sensibles (ver `audit.service.ts#loadSnapshot`).
 */

interface AuditUser {
  id: string;
  fullName: string;
  email: string;
}

interface AuditLogRow {
  id: string;
  userId: string | null;
  user: AuditUser | null;
  branchId: string | null;
  entity: string;
  entityId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

interface AuditLogResponse {
  items: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

const FECHA_HORA_BOGOTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatFechaHora(value: string): string {
  return FECHA_HORA_BOGOTA.format(new Date(value)).replace(',', '');
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu usuario no tiene permiso para ver la auditoría. Solo administradores y auditoría pueden consultar este rastro: pídele acceso a un administrador.';
    }
    if (error.status === 401) {
      return 'Tu sesión ya no es válida. Vuelve a entrar para consultar la auditoría.';
    }
    return error.message;
  }
  return 'No se pudo consultar la auditoría. Revisa la conexión e inténtalo de nuevo.';
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

function FilaAuditoria({ fila }: { fila: AuditLogRow }) {
  const [abierta, setAbierta] = useState(false);
  const tieneCambios = fila.oldValue != null || fila.newValue != null;

  return (
    <>
      <tr className="border-t border-slate-100 align-top hover:bg-slate-50">
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
          {formatFechaHora(fila.createdAt)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-800">
          {fila.user ? fila.user.fullName : fila.userId ? fila.userId : 'Sistema'}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fila.entity}</td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fila.action}</td>
        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
          {fila.entityId.length > 12 ? `${fila.entityId.slice(0, 12)}…` : fila.entityId}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {tieneCambios ? (
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              {abierta ? 'Ocultar' : 'Ver cambios'}
            </button>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
      </tr>
      {abierta && tieneCambios && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Antes
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-white p-2 text-xs text-slate-700">
                  {fila.oldValue != null ? JSON.stringify(fila.oldValue, null, 2) : 'No capturado'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Después
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-white p-2 text-xs text-slate-700">
                  {fila.newValue != null ? JSON.stringify(fila.newValue, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AuditLogPage() {
  const [entidad, setEntidad] = useState('');
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const pageSize = 50;

  const [filtros, setFiltros] = useState({ entity: '', action: '', from: '', to: '' });

  const { data: entidades } = useQuery({
    queryKey: ['audit-log-entities'],
    queryFn: () => api.get<string[]>('/audit-logs/entities'),
  });

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['audit-logs', filtros, pagina],
    queryFn: () =>
      api.get<AuditLogResponse>(
        `/audit-logs?${buildQueryString({
          entity: filtros.entity,
          action: filtros.action,
          from: filtros.from,
          to: filtros.to,
          page: pagina,
          pageSize,
        })}`,
      ),
  });

  function consultar(e: FormEvent) {
    e.preventDefault();
    setPagina(1);
    setFiltros({ entity: entidad, action: accion, from: desde, to: hasta });
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const sinResultados = !isPending && !isError && items.length === 0;
  const desdeIdx = total === 0 ? 0 : (pagina - 1) * pageSize + 1;
  const hastaIdx = Math.min(pagina * pageSize, total);
  const hayMas = pagina * pageSize < total;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Auditoría</h2>
      <p className="mb-6 text-sm text-slate-500">
        Rastro de cambios sensibles: quién hizo qué, cuándo y sobre qué registro.
      </p>

      <form
        onSubmit={consultar}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <div>
          <label htmlFor="entidad" className="mb-1 block text-xs font-medium text-slate-500">
            Entidad
          </label>
          {entidades && entidades.length > 0 ? (
            <select
              id="entidad"
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {entidades.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="entidad"
              type="text"
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              placeholder="Contract, Customer…"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          )}
        </div>
        <div>
          <label htmlFor="accion" className="mb-1 block text-xs font-medium text-slate-500">
            Acción
          </label>
          <input
            id="accion"
            type="text"
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            placeholder="ContractCreated…"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="desde" className="mb-1 block text-xs font-medium text-slate-500">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-xs font-medium text-slate-500">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isFetching}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isFetching ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      {isPending && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500" aria-live="polite">
          Cargando la auditoría…
        </p>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6" aria-live="polite">
          <p className="text-sm text-red-700">{mensajeDeError(error)}</p>
          {!(error instanceof ApiError && (error.status === 401 || error.status === 403)) && (
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {sinResultados && (
        <div className="rounded-lg border border-slate-200 bg-white p-6" aria-live="polite">
          <p className="text-sm text-slate-600">No hay registros de auditoría con estos filtros.</p>
        </div>
      )}

      {!isPending && !isError && items.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {desdeIdx}–{hastaIdx} de {total}
              {isFetching && ' · actualizando…'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!hayMas}
                onClick={() => setPagina((p) => p + 1)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Rastro de auditoría</caption>
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Fecha/hora</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Usuario</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Entidad</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Acción</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">ID</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Cambios</th>
                </tr>
              </thead>
              <tbody>
                {items.map((fila) => (
                  <FilaAuditoria key={fila.id} fila={fila} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
