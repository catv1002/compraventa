import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';

/**
 * Libro de caja (extracto con saldo corrido) — pantalla C-07 del legado.
 *
 * Es la herramienta con la que el negocio encuentra un descuadre: hoy lo hacen
 * "contrato por contrato" (docs/11 §3.2). Lo que permite esa búsqueda es el
 * saldo corrido, así que las columnas y su orden se reproducen tal cual:
 * `Documento | Fecha | Detalle | Debito | Credito | Saldo | Fecha Proceso`.
 *
 * El saldo lo encadena SIEMPRE el servidor (`GET /cash-registers/statement`).
 * Aquí no se suma un solo peso: si el navegador acumulara, dos pantallas
 * podrían mostrar dos saldos distintos del mismo día y el número con el que se
 * cuadra la caja dependería de quién lo abrió.
 *
 * El texto de la columna `Detalle` viene del servidor con la terminología legal
 * del libro (`RECOMPRA PAGADO POR ACTUALIZACION…`, RN-25) y se muestra tal
 * cual. El resto de la pantalla habla el idioma del operador.
 */

/** Una fila tal como la devuelve el servidor; las fechas llegan como ISO. */
interface StatementRow {
  id: string;
  documento: string | null;
  fecha: string;
  detalle: string;
  /** Entrada de efectivo. Cero cuando la fila es un crédito. */
  debito: number;
  /** Salida de efectivo. Cero cuando la fila es un débito. */
  credito: number;
  /** Saldo DESPUÉS de aplicar esta fila. Lo calcula el servidor. */
  saldo: number;
  fechaProceso: string;
  contractId: string | null;
}

interface CashStatement {
  branchId: string;
  from: string;
  to: string;
  cashRegisterIds: string[];
  /** Saldo sobre el que encadena la primera fila; sin él no se puede auditar. */
  saldoInicial: number;
  filas: StatementRow[];
  totalDebitos: number;
  totalCreditos: number;
  saldoFinal: number;
}

/**
 * Fecha del día en Bogotá, en formato `YYYY-MM-DD` para `<input type="date">`.
 *
 * No se usa `toISOString()`: a partir de las 19:00 en Colombia el UTC ya está en
 * el día siguiente y la pantalla abriría por defecto en una fecha sin
 * movimientos, justo en la franja en que se cierra la caja.
 */
const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });

function hoyEnBogota(): string {
  return ISO_DAY.format(new Date());
}

/**
 * Formateadores propios de esta pantalla.
 *
 * `formatDate` de `lib/format.ts` fija la zona en UTC porque allí las fechas son
 * DateTime a medianoche. Aquí no: `fecha` y `fechaProceso` son marcas de tiempo
 * reales con hora, así que hay que leerlas en la hora de Colombia — un asiento
 * de las 20:00 formateado en UTC saldría con la fecha del día siguiente y
 * rompería exactamente la lectura que esta pantalla existe para dar.
 */
const FECHA_BOGOTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const FECHA_HORA_BOGOTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatFecha(value: string): string {
  return FECHA_BOGOTA.format(new Date(value));
}

function formatFechaProceso(value: string): string {
  return FECHA_HORA_BOGOTA.format(new Date(value)).replace(',', '');
}

/** Mensaje para el operador, no el crudo del servidor cuando es de permisos. */
function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu usuario no tiene permiso para ver el libro de caja. Este movimiento de dinero solo lo pueden consultar cajeros, jefes de sucursal, contabilidad y auditoría: pídele acceso a un administrador.';
    }
    if (error.status === 401) {
      return 'Tu sesión ya no es válida. Vuelve a entrar para consultar el libro de caja.';
    }
    return error.message;
  }
  return 'No se pudo consultar el libro de caja. Revisa la conexión e inténtalo de nuevo.';
}

const CELDA_NUM = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

export function CashStatementPage() {
  const hoy = hoyEnBogota();

  // Lo que el operador está escribiendo…
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  // …y el rango efectivamente consultado. Separarlos evita una consulta por
  // cada tecla mientras se escribe la fecha.
  const [rango, setRango] = useState({ from: hoy, to: hoy });

  const rangoInvertido = desde !== '' && hasta !== '' && hasta < desde;

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['cash-statement', rango.from, rango.to],
    queryFn: () =>
      api.get<CashStatement>(
        `/cash-registers/statement?from=${encodeURIComponent(rango.from)}&to=${encodeURIComponent(rango.to)}`,
      ),
  });

  function consultar(e: FormEvent) {
    e.preventDefault();
    if (!desde || !hasta || rangoInvertido) return;
    setRango({ from: desde, to: hasta });
  }

  function aplicarRango(from: string, to: string) {
    setDesde(from);
    setHasta(to);
    setRango({ from, to });
  }

  function diasAtras(dias: number): string {
    const base = new Date(`${hoy}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() - dias);
    return ISO_DAY.format(base);
  }

  const filas = data?.filas ?? [];
  const sinMovimientos = !isPending && !isError && filas.length === 0;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Libro de caja</h2>
      <p className="mb-6 text-sm text-slate-500">
        Todos los movimientos de efectivo en orden, con el saldo que queda después de cada uno. Es la
        pantalla para encontrar en qué movimiento se descuadró la caja: se recorre hacia atrás hasta
        la fila donde el saldo dejó de coincidir.
      </p>

      {/* ---------- Rango de fechas ---------- */}
      <form
        onSubmit={consultar}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <div>
          <label htmlFor="desde" className="mb-1 block text-xs font-medium text-slate-500">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={desde}
            autoFocus
            onChange={(e) => setDesde(e.target.value)}
            required
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
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={rangoInvertido || isFetching}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isFetching ? 'Consultando…' : 'Consultar'}
        </button>

        <div className="flex gap-2 border-l border-slate-200 pl-3">
          <button
            type="button"
            onClick={() => aplicarRango(hoy, hoy)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => aplicarRango(diasAtras(1), diasAtras(1))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Ayer
          </button>
          <button
            type="button"
            onClick={() => aplicarRango(diasAtras(6), hoy)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Últimos 7 días
          </button>
        </div>

        {rangoInvertido && (
          <p className="w-full text-sm text-red-600">
            La fecha «Hasta» es anterior a «Desde». Corrígela para poder consultar.
          </p>
        )}
      </form>

      {/* ---------- Resumen: sin el saldo inicial las filas no se pueden auditar ---------- */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Saldo inicial del rango
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">
            {data ? formatCOP(data.saldoInicial) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Con lo que arrancó la caja</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Débitos · entró
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">
            {data ? formatCOP(data.totalDebitos) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Pagos, abonos y liquidaciones</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Créditos · salió
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-red-700">
            {data ? formatCOP(data.totalCreditos) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Préstamos entregados al cliente</p>
        </div>
        {/* La cifra que el operador confronta contra el efectivo físico. */}
        <div className="rounded-lg border-2 border-slate-900 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo final</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {data ? formatCOP(data.saldoFinal) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Lo que debe haber en la caja</p>
        </div>
      </div>

      {/* ---------- Estados ---------- */}
      {isPending && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500" aria-live="polite">
          Cargando los movimientos del rango…
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

      {sinMovimientos && (
        <div className="rounded-lg border border-slate-200 bg-white p-6" aria-live="polite">
          <p className="text-sm text-slate-600">
            No hubo movimientos de caja entre el {formatFecha(`${rango.from}T12:00:00Z`)} y el{' '}
            {formatFecha(`${rango.to}T12:00:00Z`)}.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Si esperabas ver movimientos, revisa el rango de fechas o si la caja de ese día llegó a
            abrirse.
          </p>
        </div>
      )}

      {/* ---------- El libro ---------- */}
      {!isPending && !isError && filas.length > 0 && (
        <>
          <p className="mb-2 text-sm text-slate-500">
            {filas.length} movimiento{filas.length === 1 ? '' : 's'} entre el{' '}
            {formatFecha(`${rango.from}T12:00:00Z`)} y el {formatFecha(`${rango.to}T12:00:00Z`)}
            {isFetching && ' · actualizando…'}
          </p>

          <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <caption className="sr-only">
                Libro de caja: movimientos con saldo corrido calculado por el servidor
              </caption>
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Documento</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Fecha</th>
                  <th scope="col" className="w-full px-3 py-2">Detalle</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Débito · entra</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Crédito · sale</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Saldo</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2">Fecha proceso</th>
                </tr>
              </thead>
              <tbody>
                {/* El saldo inicial encabeza la cadena: la primera fila se
                    verifica sumándole su débito o restándole su crédito. */}
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2 font-medium">Saldo inicial del rango</td>
                  <td className={CELDA_NUM}>—</td>
                  <td className={CELDA_NUM}>—</td>
                  <td className={`${CELDA_NUM} font-semibold`}>{formatCOP(data!.saldoInicial)}</td>
                  <td className="px-3 py-2">—</td>
                </tr>

                {filas.map((fila) => (
                  <tr key={fila.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                      {fila.documento ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                      {formatFecha(fila.fecha)}
                    </td>
                    {/* Texto largo del libro: se muestra completo, con la
                        terminología legal que envía el servidor (RN-25). */}
                    <td className="px-3 py-2 text-slate-800 break-words [overflow-wrap:anywhere]">
                      {fila.detalle}
                    </td>
                    <td className={`${CELDA_NUM} font-medium text-emerald-700`}>
                      {fila.debito > 0 ? formatCOP(fila.debito) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`${CELDA_NUM} font-medium text-red-700`}>
                      {fila.credito > 0 ? formatCOP(fila.credito) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`${CELDA_NUM} font-semibold text-slate-900`}>
                      {formatCOP(fila.saldo)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                      {formatFechaProceso(fila.fechaProceso)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold text-slate-800">
                  <td className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 px-3 py-2" colSpan={3}>
                    Totales del rango
                  </td>
                  <td className={`sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 ${CELDA_NUM} text-emerald-700`}>
                    {formatCOP(data!.totalDebitos)}
                  </td>
                  <td className={`sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 ${CELDA_NUM} text-red-700`}>
                    {formatCOP(data!.totalCreditos)}
                  </td>
                  <td className={`sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 ${CELDA_NUM}`}>
                    {formatCOP(data!.saldoFinal)}
                  </td>
                  <td className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            El saldo de cada fila lo calcula el servidor sobre el saldo inicial; el orden es el de
            registro, con la hora exacta en «Fecha proceso».
          </p>
        </>
      )}
    </div>
  );
}
