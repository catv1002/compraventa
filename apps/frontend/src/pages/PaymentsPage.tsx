import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api-client';
import { formatCOP, formatDate } from '../lib/format';
import { Modal } from '../components/Modal';

/**
 * Cobro de mostrador.
 *
 * Reproduce la ergonomía de la pantalla "Ingreso de Transacciones" del sistema
 * legado (capturas C-02 y C-09): una fila por préstamo leída en dos mitades,
 * izquierda "cómo está" y derecha "cómo queda", y un único total grande al pie
 * que es lo que el operador le dice al cliente.
 *
 * El operador **no digita plata**: elige la operación y cuántos meses paga. Todo
 * importe visible sale del servidor (`GET /contracts/:id/quote`); lo único que
 * ocurre aquí es sumar cifras que el servidor ya calculó.
 */

interface Customer {
  id: string;
  fullName: string;
  identificationNumber: string;
}
interface Item {
  id: string;
  description: string | null;
}
interface Contract {
  id: string;
  contractNumber: number;
  status: string;
  contractType: string;
  principalAmount: string;
  paidAmount: string;
  dueDate: string | null;
  customer: Customer;
  item: Item;
}
interface CashRegister {
  id: string;
}

/** Un mes de interés causado, tal como lo desglosa el servidor. */
interface InterestPeriod {
  from: string;
  to: string;
  amount: number;
}

/**
 * Estado de cuenta calculado por el servidor (GET /contracts/:id/quote).
 * Importes en `number`; fechas en ISO.
 */
interface Quote {
  contractId: string;
  contractNumber: number;
  currentPrincipal: number;
  monthlyAmount: number;
  monthsOwed: number;
  interestOwed: number;
  settlementTotal: number;
  isCurrent: boolean;
  /** Fecha hasta la que están pagados los intereses (el `Fecha Act` del legado). */
  chargingFrom: string;
  nextAccrualDate: string;
  breakdown: InterestPeriod[];
}

type Operation = 'interest' | 'principal' | 'settle';

/**
 * Los ocho `ContractStatus` internos agrupados en los cinco estados con los que
 * razona el negocio, con color **y** texto (nada depende solo del color).
 */
function businessStatus(contract: Contract): { label: string; tone: string; operable: boolean } {
  switch (contract.status) {
    case 'Active':
    case 'Renewed':
      return { label: 'Vigente', tone: 'bg-slate-100 text-slate-700', operable: true };
    case 'Overdue':
    case 'Expired':
      return { label: 'Vencido', tone: 'bg-amber-100 text-amber-800', operable: true };
    case 'Created':
      return { label: 'Sin desembolsar', tone: 'bg-slate-100 text-slate-600', operable: false };
    case 'Settled':
      return { label: 'Liquidado', tone: 'bg-emerald-100 text-emerald-800', operable: false };
    case 'Forfeited':
      return { label: 'Joya rematada', tone: 'bg-red-100 text-red-700', operable: false };
    case 'Cancelled':
      return {
        label: contract.contractType === 'Layaway' ? 'Anulado' : 'Retirado',
        tone: 'bg-slate-200 text-slate-500',
        operable: false,
      };
    default:
      return { label: contract.status, tone: 'bg-slate-100 text-slate-700', operable: false };
  }
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

export function PaymentsPage() {
  // `?q=` permite llegar directo desde otra pantalla (Contratos) con la
  // búsqueda ya hecha — evita retipear el número de préstamo que esa otra
  // pantalla ya tenía a la vista.
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data: contracts, isLoading, isError, error } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.get<Contract[]>('/contracts'),
  });
  const { data: register } = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<CashRegister | null>('/cash-registers/current'),
  });

  // Solo préstamos: el plan separe y la compra directa no devengan intereses y
  // el endpoint de cotización los rechaza.
  const matches = useMemo(() => {
    const pawns = (contracts ?? []).filter((c) => c.contractType === 'Pawn');
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return pawns.filter(
      (c) =>
        c.customer.identificationNumber.toLowerCase().includes(q) ||
        c.customer.fullName.toLowerCase().includes(q) ||
        String(c.contractNumber).includes(q),
    );
  }, [contracts, term]);

  const selected = (contracts ?? []).find((c) => c.id === selectedId) ?? null;

  // Si se llegó con `?q=` (desde Contratos), abre directo el préstamo si hay
  // un único resultado operable — mismo criterio que Enter en la búsqueda
  // manual (handleSearch), pero disparado una vez que los contratos cargan.
  useEffect(() => {
    if (!searchParams.get('q') || !contracts) return;
    const operables = matches.filter((c) => businessStatus(c).operable);
    if (operables.length === 1) {
      setSelectedId(operables[0].id);
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setFlash(null);
    // Con un solo resultado, Enter lo abre: el flujo cédula → operación se hace
    // sin soltar el teclado numérico.
    const operables = matches.filter((c) => businessStatus(c).operable);
    setSelectedId(operables.length === 1 ? operables[0].id : null);
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Cobro de mostrador</h2>
      <p className="mb-4 text-xs text-slate-500">
        Busque por cédula del cliente, nombre o número de préstamo. El sistema calcula el valor a cobrar.
      </p>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          autoFocus
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setSelectedId(null);
            setFlash(null);
          }}
          placeholder="Cédula, nombre o número de préstamo"
          aria-label="Buscar cliente o préstamo"
          className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-base"
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Buscar
        </button>
      </form>

      {!register && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          La caja de la sucursal está cerrada. Ábrala en <span className="font-medium">Caja</span> para poder recibir
          pagos.
        </p>
      )}

      {flash && (
        <p className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">{flash}</p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Cargando préstamos…</p>}
      {isError && <p className="text-sm text-red-600">{(error as ApiError).message}</p>}

      {term.trim() && matches.length === 0 && !isLoading && (
        <p className="text-sm text-slate-500">No hay préstamos que coincidan con «{term.trim()}».</p>
      )}

      {!selected && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map((contract) => {
            const status = businessStatus(contract);
            return (
              <li key={contract.id}>
                <button
                  onClick={() => setSelectedId(contract.id)}
                  disabled={!status.operable}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-white"
                >
                  <span>
                    <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                      N.º {contract.contractNumber}
                    </span>
                    <span className="font-medium text-slate-800">{contract.customer.fullName}</span>
                    <span className="text-slate-500"> · {contract.customer.identificationNumber}</span>
                    <span className="block text-xs text-slate-500">
                      {contract.item.description ?? 'Artículo'} · préstamo {formatCOP(contract.principalAmount)}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
                    {status.label}
                    {!status.operable && ' · no se puede cobrar'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <CounterPanel
          key={selected.id}
          contract={selected}
          cashRegisterId={register?.id}
          onBack={() => setSelectedId(null)}
          onSettled={(message) => {
            setFlash(message);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * La fila del legado, partida en dos mitades. Izquierda: situación del préstamo
 * hoy. Derecha: lo que se cobra y cómo queda el préstamo después.
 */
function CounterPanel({
  contract,
  cashRegisterId,
  onBack,
  onSettled,
}: {
  contract: Contract;
  cashRegisterId?: string;
  onBack: () => void;
  onSettled: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<Operation>('interest');
  const [monthsToPay, setMonthsToPay] = useState(1);
  /** Fracción del saldo que abona el cliente. El operador escoge la proporción,
   *  nunca teclea el importe. */
  const [principalFraction, setPrincipalFraction] = useState(0.5);
  const [confirmingSettlement, setConfirmingSettlement] = useState(false);
  const [hasThirdParty, setHasThirdParty] = useState(false);
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyIdNumber, setThirdPartyIdNumber] = useState('');
  const [lostReceipt, setLostReceipt] = useState(false);
  const [verifiedIdNumber, setVerifiedIdNumber] = useState('');

  const {
    data: quote,
    isLoading,
    isError,
    error: quoteError,
  } = useQuery({
    queryKey: ['contract-quote', contract.id],
    queryFn: () => api.get<Quote>(`/contracts/${contract.id}/quote`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contract-quote', contract.id] });
    queryClient.invalidateQueries({ queryKey: ['contracts'] });
    queryClient.invalidateQueries({ queryKey: ['cash-current'] });
  };

  const payInterest = useMutation({
    mutationFn: () => api.post(`/contracts/${contract.id}/interest`, { months: monthsToPay, cashRegisterId }),
    onSuccess: () => {
      setMonthsToPay(1);
      refresh();
    },
  });

  const payPrincipal = useMutation({
    mutationFn: (amount: number) => api.post(`/contracts/${contract.id}/principal`, { amount, cashRegisterId }),
    onSuccess: refresh,
  });

  const settle = useMutation({
    mutationFn: () =>
      api.post(`/contracts/${contract.id}/settle?cashRegisterId=${cashRegisterId}`, {
        // Confirmación de lo que se le mostró al cliente: si el servidor calcula
        // otra cosa, rechaza en vez de cobrar de menos en silencio.
        expectedTotal: quote?.settlementTotal,
        thirdPartyName: hasThirdParty ? thirdPartyName : undefined,
        thirdPartyIdNumber: hasThirdParty ? thirdPartyIdNumber : undefined,
        lostReceipt,
        verifiedIdNumber: lostReceipt ? verifiedIdNumber : undefined,
      }),
    onSuccess: () => {
      setConfirmingSettlement(false);
      setLostReceipt(false);
      setVerifiedIdNumber('');
      refresh();
      onSettled(`Préstamo N.º ${contract.contractNumber} liquidado. Entregue la joya al cliente.`);
    },
  });

  if (isLoading) {
    return <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Consultando el préstamo…</p>;
  }
  if (isError || !quote) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4">
        <p className="text-sm text-red-600">{(quoteError as ApiError)?.message ?? 'No se pudo consultar el préstamo.'}</p>
        <button onClick={onBack} className="mt-2 text-sm text-slate-600 underline">
          Volver a la búsqueda
        </button>
      </div>
    );
  }

  // Aritmética presentacional: se suman los importes por mes que ya calculó el
  // servidor (`breakdown`), no se calcula ningún interés aquí.
  const interestFor = (months: number) =>
    quote.breakdown.slice(0, months).reduce((total, period) => total + period.amount, 0);
  const newPaidThroughFor = (months: number) =>
    months > 0 && quote.breakdown[months - 1] ? quote.breakdown[months - 1].to : quote.chargingFrom;

  // Única cifra que no viene tal cual del servidor: la proporción del saldo que
  // el cliente decide abonar. No es un cálculo de deuda —el saldo lo dio el
  // servidor— y el backend valida el importe contra el capital vigente antes de
  // aceptarlo. Falta un endpoint que cotice el abono (ver reporte).
  const principalPayment = Math.round(quote.currentPrincipal * principalFraction);

  const blockedPrincipal = !quote.isCurrent;
  const noRegister = !cashRegisterId;
  const busy = payInterest.isPending || payPrincipal.isPending || settle.isPending;

  const totalToCharge =
    operation === 'interest'
      ? interestFor(monthsToPay)
      : operation === 'principal'
        ? principalPayment
        : quote.settlementTotal;

  const error = (payInterest.error ?? payPrincipal.error ?? settle.error) as ApiError | null;
  const status = businessStatus(contract);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm">
          <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
            N.º {contract.contractNumber}
          </span>
          <span className="font-semibold text-slate-800">{contract.customer.fullName}</span>
          <span className="text-slate-500"> · {contract.customer.identificationNumber}</span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
          <span className="block text-xs text-slate-500">{contract.item.description ?? 'Artículo'}</span>
        </p>
        <button onClick={onBack} className="text-sm text-slate-600 underline">
          Buscar otro
        </button>
      </div>

      <div className="grid gap-px bg-slate-200 md:grid-cols-2">
        {/* ---------- Mitad izquierda: cómo está ---------- */}
        <section className="bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Cómo está el préstamo</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Intereses pagados hasta">
              {formatDate(quote.chargingFrom)}{' '}
              <span className="text-xs text-slate-500">(hace {daysSince(quote.chargingFrom)} días)</span>
            </Row>
            <Row label="Meses de interés vencidos" tone={quote.monthsOwed > 0 ? 'warn' : 'ok'}>
              {quote.monthsOwed === 0 ? 'Ninguno — al día' : `${quote.monthsOwed} mes(es)`}
            </Row>
            <Row label="Préstamo inicial">{formatCOP(contract.principalAmount)}</Row>
            <Row label="Abonos hechos">{formatCOP(contract.paidAmount)}</Row>
            <Row label="Saldo del préstamo" strong>
              {formatCOP(quote.currentPrincipal)}
            </Row>
            <Row label="Intereses pendientes" tone={quote.interestOwed > 0 ? 'warn' : 'ok'}>
              {formatCOP(quote.interestOwed)}
            </Row>
          </dl>
        </section>

        {/* ---------- Mitad derecha: cómo queda ---------- */}
        <section className="bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Lo que se cobra ahora</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Operación">
              {operation === 'interest' ? 'Pagar intereses' : operation === 'principal' ? 'Abonar al préstamo' : 'Liquidar y entregar'}
            </Row>
            <Row label="Meses que cubre">
              {operation === 'interest' ? `${monthsToPay} mes(es)` : operation === 'settle' ? `${quote.monthsOwed} mes(es)` : '—'}
            </Row>
            <Row label="Intereses a cobrar">
              {formatCOP(operation === 'interest' ? interestFor(monthsToPay) : operation === 'settle' ? quote.interestOwed : 0)}
            </Row>
            <Row label="Abono al préstamo">
              {formatCOP(operation === 'principal' ? principalPayment : operation === 'settle' ? quote.currentPrincipal : 0)}
            </Row>
            <Row label="Saldo del préstamo después" strong>
              {operation === 'settle'
                ? formatCOP(0)
                : operation === 'principal'
                  ? formatCOP(quote.currentPrincipal - principalPayment)
                  : formatCOP(quote.currentPrincipal)}
            </Row>
            <Row label="Intereses quedan pagados hasta">
              {operation === 'settle'
                ? 'Préstamo cerrado'
                : formatDate(operation === 'interest' ? newPaidThroughFor(monthsToPay) : quote.chargingFrom)}
            </Row>
          </dl>
        </section>
      </div>

      {/* ---------- Total, la cifra más grande de la pantalla ---------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-y border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-medium text-slate-600">Total a pagar</span>
        <span className="text-3xl font-bold tabular-nums text-slate-900">{formatCOP(totalToCharge)}</span>
      </div>

      {error && (
        <p role="alert" className="border-b border-slate-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {noRegister && (
        <p className="border-b border-slate-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          No se puede recibir dinero con la caja cerrada. Ábrala en <span className="font-medium">Caja</span>.
        </p>
      )}

      {/* ---------- Operación ---------- */}
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Operación">
          <OperationTab active={operation === 'interest'} onClick={() => setOperation('interest')}>
            Pagar intereses
          </OperationTab>
          <OperationTab active={operation === 'principal'} onClick={() => setOperation('principal')}>
            Abonar al préstamo
          </OperationTab>
          <OperationTab active={operation === 'settle'} onClick={() => setOperation('settle')}>
            Liquidar y entregar
          </OperationTab>
        </div>

        {operation === 'interest' && (
          <div className="flex flex-wrap items-center gap-2">
            {quote.monthsOwed === 0 ? (
              <p className="text-sm text-slate-600">
                El préstamo está al día en intereses hasta el {formatDate(quote.chargingFrom)}. No hay nada que cobrar
                por este concepto.
              </p>
            ) : (
              <>
                <label htmlFor="months" className="text-sm text-slate-700">
                  Meses que paga:
                </label>
                <select
                  id="months"
                  value={monthsToPay}
                  onChange={(e) => setMonthsToPay(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {Array.from({ length: quote.monthsOwed }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m} mes(es) — {formatCOP(interestFor(m))}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => payInterest.mutate()}
                  disabled={noRegister || busy}
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {payInterest.isPending ? 'Registrando…' : `Cobrar ${formatCOP(interestFor(monthsToPay))}`}
                </button>
              </>
            )}
          </div>
        )}

        {operation === 'principal' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-700">Cuánto abona:</span>
              {[0.25, 0.5, 0.75].map((fraction) => (
                <button
                  key={fraction}
                  onClick={() => setPrincipalFraction(fraction)}
                  disabled={blockedPrincipal}
                  aria-pressed={principalFraction === fraction}
                  className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
                    principalFraction === fraction
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {formatCOP(Math.round(quote.currentPrincipal * fraction))}
                </button>
              ))}
              <button
                onClick={() => payPrincipal.mutate(principalPayment)}
                disabled={blockedPrincipal || noRegister || busy}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {payPrincipal.isPending ? 'Registrando…' : `Cobrar ${formatCOP(principalPayment)}`}
              </button>
            </div>
            {blockedPrincipal ? (
              // RN-03: el backend rechaza el abono con intereses en mora. La UI
              // deshabilita y explica cómo habilitarlo, no lo esconde.
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No se puede abonar al préstamo con {quote.monthsOwed} mes(es) de intereses vencidos (
                {formatCOP(quote.interestOwed)}). Primero cobre los intereses en{' '}
                <span className="font-medium">Pagar intereses</span>; el abono se habilita cuando el préstamo quede al
                día.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Para pagar todo el saldo y entregar la joya use <span className="font-medium">Liquidar y entregar</span>.
              </p>
            )}
          </div>
        )}

        {operation === 'settle' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              El cliente paga saldo del préstamo más intereses y se le entrega la joya. El préstamo queda cerrado.
            </p>
            <button
              onClick={() => setConfirmingSettlement(true)}
              disabled={noRegister || busy}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Liquidar por {formatCOP(quote.settlementTotal)}
            </button>
          </div>
        )}
      </div>

      {confirmingSettlement && (
        <Modal title="Confirmar liquidación" onClose={() => setConfirmingSettlement(false)}>
          <p className="mb-3 text-sm text-slate-600">
            Esta operación cierra el préstamo N.º {contract.contractNumber} de {contract.customer.fullName} y no se
            puede deshacer. Verifique el efectivo antes de confirmar.
          </p>
          <dl className="mb-3 space-y-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <Row label="Saldo del préstamo">{formatCOP(quote.currentPrincipal)}</Row>
            <Row label={`Intereses (${quote.monthsOwed} mes(es))`}>{formatCOP(quote.interestOwed)}</Row>
            <Row label="Total a pagar" strong>
              {formatCOP(quote.settlementTotal)}
            </Row>
          </dl>

          <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={hasThirdParty} onChange={(e) => setHasThirdParty(e.target.checked)} />
            La joya la retira un tercero autorizado (no el cliente)
          </label>
          {hasThirdParty && (
            <div className="mb-3 flex gap-2">
              <input
                value={thirdPartyName}
                onChange={(e) => setThirdPartyName(e.target.value)}
                placeholder="Nombre de quien retira"
                aria-label="Nombre de quien retira"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                value={thirdPartyIdNumber}
                onChange={(e) => setThirdPartyIdNumber(e.target.value)}
                placeholder="Cédula"
                aria-label="Cédula de quien retira"
                className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}

          <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={lostReceipt} onChange={(e) => setLostReceipt(e.target.checked)} />
            El cliente no trae el recibo del empeño (recibo perdido)
          </label>
          {lostReceipt && (
            <div className="mb-3">
              <input
                value={verifiedIdNumber}
                onChange={(e) => setVerifiedIdNumber(e.target.value)}
                placeholder="Cédula del documento presentado"
                aria-label="Cédula verificada del cliente"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Pida un documento de identidad y teclee la cédula tal como aparece — el sistema la verifica contra
                la del cliente registrado antes de permitir la liquidación.
              </p>
            </div>
          )}

          {settle.isError && <p className="mb-2 text-sm text-red-600">{(settle.error as ApiError).message}</p>}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmingSettlement(false)}
              disabled={settle.isPending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => settle.mutate()}
              disabled={settle.isPending || (lostReceipt && !verifiedIdNumber.trim())}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {settle.isPending ? 'Liquidando…' : `Confirmar y cobrar ${formatCOP(quote.settlementTotal)}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({
  label,
  children,
  strong,
  tone,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
  tone?: 'warn' | 'ok';
}) {
  const color = tone === 'warn' ? 'text-amber-700' : strong ? 'text-slate-900' : 'text-slate-700';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'text-base font-semibold' : ''} ${color}`}>{children}</dd>
    </div>
  );
}

function OperationTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-4 py-2 text-sm font-medium ${
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}
