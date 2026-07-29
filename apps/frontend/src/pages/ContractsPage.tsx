import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';

interface Customer {
  id: string;
  fullName: string;
}
interface Item {
  id: string;
  status: string;
  description: string | null;
}
interface Contract {
  id: string;
  contractNumber: number;
  status: string;
  contractType: string;
  principalAmount: string;
  dueDate: string | null;
  customer: Customer;
  item: Item;
}
interface CashRegister {
  id: string;
}

/**
 * Estado de cuenta calculado por el servidor (GET /contracts/:id/quote).
 * Ningún importe de esta pantalla se teclea: todos vienen de aquí.
 */
interface Quote {
  contractNumber: number;
  currentPrincipal: number;
  monthlyAmount: number;
  monthsOwed: number;
  interestOwed: number;
  settlementTotal: number;
  isCurrent: boolean;
  nextAccrualDate: string;
}

const STATUS_LABELS: Record<string, string> = {
  Created: 'Creado (pendiente de desembolso)',
  Active: 'Activo',
  Renewed: 'Renovado',
  Overdue: 'En mora',
  Expired: 'Vencido',
  Settled: 'Liquidado',
  Forfeited: 'Rematado',
  Cancelled: 'Cancelado',
};

// "Contrato Retirado" es un Cancelled de tipo Pawn/DirectPurchase antes de
// desembolso — distinto de un Layaway cancelado. Ver docs/01-investigacion-negocio.md §8.
function statusLabel(contract: Contract) {
  if (contract.status === 'Cancelled' && contract.contractType !== 'Layaway') {
    return 'Retirado';
  }
  return STATUS_LABELS[contract.status] ?? contract.status;
}

export function ContractsPage() {
  const queryClient = useQueryClient();
  const { data: contracts } = useQuery({ queryKey: ['contracts'], queryFn: () => api.get<Contract[]>('/contracts') });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });
  const { data: appraisedItems } = useQuery({
    queryKey: ['items', 'Appraised'],
    queryFn: () => api.get<Item[]>('/items?status=Appraised'),
  });
  const { data: register } = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<CashRegister | null>('/cash-registers/current'),
  });

  const [customerId, setCustomerId] = useState('');
  const [itemId, setItemId] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [retroventaRate, setRetroventaRate] = useState('4');
  const [dueDate, setDueDate] = useState('');

  const createContract = useMutation({
    mutationFn: () =>
      api.post('/contracts', {
        contractType: 'Pawn',
        customerId,
        itemId,
        principalAmount: Number(purchaseValue),
        interestRate: Number(retroventaRate) / 100,
        dueDate: dueDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setPurchaseValue('');
      setDueDate('');
    },
  });

  const disburseContract = useMutation({
    mutationFn: (contractId: string) => api.post(`/contracts/${contractId}/disburse?cashRegisterId=${register?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
    },
  });

  const withdrawContract = useMutation({
    mutationFn: (contractId: string) => api.post(`/contracts/${contractId}/withdraw`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });

  const [openContractId, setOpenContractId] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createContract.mutate();
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Contratos de compraventa con pacto de retroventa</h2>
      <p className="mb-4 text-xs text-slate-500">
        El bien pasa a propiedad del negocio desde la firma; el cliente puede recomprarlo pagando el valor de
        retroventa antes del vencimiento — ver docs/01-investigacion-negocio.md §1.1.
      </p>

      {!register && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Necesitas la caja de la sucursal abierta para desembolsar o liquidar contratos.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Cliente…</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>{c.fullName}</option>
          ))}
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Artículo avaluado…</option>
          {appraisedItems?.map((i) => (
            <option key={i.id} value={i.id}>{i.description ?? i.id.slice(0, 8)}</option>
          ))}
        </select>
        <input value={purchaseValue} onChange={(e) => setPurchaseValue(e.target.value)} placeholder="Valor de compra" type="number" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
        <input value={retroventaRate} onChange={(e) => setRetroventaRate(e.target.value)} placeholder="% Retroventa mensual" type="number" step="0.1" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
        {/* Opcional: si se deja vacío, el servidor aplica el plazo configurado
            (6 meses por defecto, RN-02) en vez de exigir que se teclee. */}
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" title="Vencimiento (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={createContract.isPending} className="col-span-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 md:col-span-1">
          Crear contrato
        </button>
      </form>

      {createContract.isError && (
        <p className="mb-4 text-sm text-red-600">{(createContract.error as ApiError).message}</p>
      )}

      <div className="space-y-2">
        {contracts?.map((contract) => (
          <div key={contract.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">
                  {/* El consecutivo es como el negocio y el cliente identifican
                      el contrato; el uuid no se muestra nunca (RN-08). */}
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                    N.º {contract.contractNumber}
                  </span>
                  {contract.customer.fullName} · {contract.item.description ?? 'Artículo'}
                </p>
                <p className="text-xs text-slate-500">
                  Préstamo {formatCOP(contract.principalAmount)} ·{' '}
                  <span className="font-medium">{statusLabel(contract)}</span>
                  {contract.dueDate && ` · vence ${new Date(contract.dueDate).toLocaleDateString('es-CO')}`}
                </p>
              </div>

              <div className="flex gap-2">
                {contract.status === 'Created' && (
                  <>
                    <button
                      onClick={() => disburseContract.mutate(contract.id)}
                      disabled={!register}
                      className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                    >
                      Desembolsar
                    </button>
                    <button
                      onClick={() => withdrawContract.mutate(contract.id)}
                      className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      Retirar
                    </button>
                  </>
                )}
                {['Active', 'Renewed', 'Overdue'].includes(contract.status) && (
                  <button
                    onClick={() => setOpenContractId(openContractId === contract.id ? null : contract.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {openContractId === contract.id ? 'Cerrar' : 'Estado de cuenta'}
                  </button>
                )}
              </div>
            </div>

            {openContractId === contract.id && (
              <ContractAccountPanel
                contract={contract}
                cashRegisterId={register?.id}
                onDone={() => setOpenContractId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Estado de cuenta y operaciones de un contrato de empeño.
 *
 * Todo lo que aquí se cobra lo calcula el servidor: el operador elige *cuántos
 * meses* paga el cliente, no cuánta plata entrega. Ese cambio es el que elimina
 * la aritmética de cabeza que hoy produce los descuadres de caja
 * (docs/11-levantamiento-campo-carrera113.md §3.2).
 */
function ContractAccountPanel({
  contract,
  cashRegisterId,
  onDone,
}: {
  contract: Contract;
  cashRegisterId?: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [monthsToPay, setMonthsToPay] = useState(1);
  const [principalAmount, setPrincipalAmount] = useState('');
  const [hasThirdParty, setHasThirdParty] = useState(false);
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyIdNumber, setThirdPartyIdNumber] = useState('');

  const { data: quote, isLoading } = useQuery({
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
    onSuccess: refresh,
  });

  const payPrincipal = useMutation({
    mutationFn: () =>
      api.post(`/contracts/${contract.id}/principal`, { amount: Number(principalAmount), cashRegisterId }),
    onSuccess: () => {
      setPrincipalAmount('');
      refresh();
    },
  });

  const settle = useMutation({
    mutationFn: () =>
      api.post(`/contracts/${contract.id}/settle?cashRegisterId=${cashRegisterId}`, {
        // Confirmación de lo que se le mostró al cliente: si el servidor calcula
        // otra cosa, rechaza en vez de cobrar de menos en silencio.
        expectedTotal: quote?.settlementTotal,
        thirdPartyName: hasThirdParty ? thirdPartyName : undefined,
        thirdPartyIdNumber: hasThirdParty ? thirdPartyIdNumber : undefined,
      }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });

  if (isLoading || !quote) {
    return <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500">Consultando estado de cuenta…</p>;
  }

  const error = (payInterest.error ?? payPrincipal.error ?? settle.error) as ApiError | null;

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Figure label="Capital vigente" value={formatCOP(quote.currentPrincipal)} />
        <Figure label="Interés mensual" value={formatCOP(quote.monthlyAmount)} />
        <Figure
          label="Meses adeudados"
          value={String(quote.monthsOwed)}
          emphasis={quote.monthsOwed > 0 ? 'warn' : undefined}
        />
        <Figure label="Total para retirar" value={formatCOP(quote.settlementTotal)} emphasis="strong" />
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      {quote.monthsOwed > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2">
          <span className="text-sm text-amber-800">Pagar intereses:</span>
          <select
            value={monthsToPay}
            onChange={(e) => setMonthsToPay(Number(e.target.value))}
            className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
          >
            {Array.from({ length: quote.monthsOwed }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} {m === 1 ? 'mes' : 'meses'} — {formatCOP(m * quote.monthlyAmount)}
              </option>
            ))}
          </select>
          <button
            onClick={() => payInterest.mutate()}
            disabled={!cashRegisterId || payInterest.isPending}
            className="rounded-md bg-amber-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Registrar pago
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={principalAmount}
          onChange={(e) => setPrincipalAmount(e.target.value)}
          placeholder="Abono a capital"
          type="number"
          disabled={!quote.isCurrent}
          className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
        />
        <button
          onClick={() => payPrincipal.mutate()}
          disabled={!quote.isCurrent || !cashRegisterId || !principalAmount || payPrincipal.isPending}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-50"
        >
          Abonar
        </button>
        {!quote.isCurrent && (
          // RN-03: la regla que el negocio considera el "plus" de su sistema.
          <span className="text-xs text-slate-500">
            El abono a capital se habilita cuando el contrato esté al día en intereses.
          </span>
        )}
      </div>

      <div className="space-y-2 rounded-md bg-slate-50 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={hasThirdParty} onChange={(e) => setHasThirdParty(e.target.checked)} />
          El bien lo retira un tercero (no el cliente titular)
        </label>
        {hasThirdParty && (
          <div className="flex gap-2">
            <input
              value={thirdPartyName}
              onChange={(e) => setThirdPartyName(e.target.value)}
              placeholder="Nombre de quien retira"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              value={thirdPartyIdNumber}
              onChange={(e) => setThirdPartyIdNumber(e.target.value)}
              placeholder="Cédula"
              className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        )}
        <button
          onClick={() => settle.mutate()}
          disabled={!cashRegisterId || settle.isPending}
          className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Liquidar y entregar por {formatCOP(quote.settlementTotal)}
        </button>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: 'warn' | 'strong';
}) {
  const tone =
    emphasis === 'warn' ? 'text-amber-700' : emphasis === 'strong' ? 'text-slate-900' : 'text-slate-700';
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
