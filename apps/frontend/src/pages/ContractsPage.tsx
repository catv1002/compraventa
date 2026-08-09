import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';
import { businessStatus } from '../lib/contract-status';
import { Modal } from '../components/Modal';
import { Receipt, ReceiptData } from '../components/Receipt';
import { TicketReceipt, TicketReceiptData } from '../components/TicketReceipt';

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


const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'Cash', label: 'Efectivo' },
  { value: 'Transfer', label: 'Transferencia' },
  { value: 'Card', label: 'Tarjeta' },
  { value: 'Other', label: 'Otro' },
];

export function ContractsPage() {
  const queryClient = useQueryClient();
  const { data: contracts } = useQuery({ queryKey: ['contracts'], queryFn: () => api.get<Contract[]>('/contracts') });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });
  const { data: appraisedItems } = useQuery({
    queryKey: ['items', 'Appraised'],
    queryFn: () => api.get<Item[]>('/items?status=Appraised'),
  });
  const { data: inStockItems } = useQuery({
    queryKey: ['items', 'InStock'],
    queryFn: () => api.get<Item[]>('/items?status=InStock'),
  });
  const { data: register } = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<CashRegister | null>('/cash-registers/current'),
  });

  const [contractType, setContractType] = useState<'Pawn' | 'Sale'>('Pawn');
  const [customerId, setCustomerId] = useState('');
  const [itemId, setItemId] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [interestRatePct, setInterestRatePct] = useState('4');
  const [dueDate, setDueDate] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [receiptContractId, setReceiptContractId] = useState<string | null>(null);
  const [receiptTicketId, setReceiptTicketId] = useState<string | null>(null);
  // Confirmación genérica para operaciones irreversibles (Desembolsar,
  // Retirar, Devolver): antes cada una usaba `window.confirm`, que no tiene
  // el mismo tratamiento de foco/teclado que el resto de la app desde que
  // `Modal` se hizo accesible — un `window.confirm` no ofrece la misma
  // garantía de foco/Escape entre navegadores/dispositivos.
  const [pendingAction, setPendingAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(
    null,
  );

  // Carrito del ticket de venta de mostrador (Option B): varios artículos, un
  // Contract Sale por línea, agrupados por saleTicketId al cobrar. Ver
  // ContractsService.createSaleTicket.
  interface CartLine {
    itemId: string;
    description: string;
    principalAmount: number;
    discountAmount: number;
  }
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartTotal = cart.reduce((sum, l) => sum + l.principalAmount, 0);

  const createContract = useMutation({
    mutationFn: () =>
      api.post('/contracts', {
        contractType: 'Pawn',
        customerId,
        itemId,
        principalAmount: Number(purchaseValue),
        interestRate: Number(interestRatePct) / 100,
        dueDate: dueDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setPurchaseValue('');
      setDueDate('');
      setItemId('');
    },
  });

  function addToCart() {
    const item = inStockItems?.find((i) => i.id === itemId);
    if (!item || !purchaseValue) return;
    setCart((prev) => [
      ...prev,
      {
        itemId,
        description: item.description ?? item.id.slice(0, 8),
        principalAmount: Number(purchaseValue),
        discountAmount: discountAmount ? Number(discountAmount) : 0,
      },
    ]);
    setItemId('');
    setPurchaseValue('');
    setDiscountAmount('');
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const createSaleTicket = useMutation({
    mutationFn: () =>
      api.post<{ saleTicketId: string }>('/contracts/sale-tickets', {
        customerId,
        cashRegisterId: register?.id,
        paymentMethod,
        items: cart.map((l) => ({
          itemId: l.itemId,
          principalAmount: l.principalAmount,
          discountAmount: l.discountAmount || undefined,
        })),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      setCart([]);
      setPaymentMethod('Cash');
      setReceiptTicketId(data.saleTicketId);
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

  const returnSale = useMutation({
    mutationFn: (contractId: string) =>
      api.post(`/contracts/${contractId}/return-sale`, { cashRegisterId: register?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (contractType === 'Sale') {
      addToCart();
    } else {
      createContract.mutate();
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Contratos</h2>
      <p className="mb-4 text-xs text-slate-500">
        Empeño: el bien queda en garantía y el cliente lo recupera pagando el préstamo más intereses antes del
        vencimiento.{' '}
        <span
          className="cursor-help underline decoration-dotted"
          title="Legalmente es una compraventa con pacto de retroventa — ver docs/01-investigacion-negocio.md §1.1."
        >
          ¿Qué figura legal es esta?
        </span>
      </p>

      {!register && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Necesitas la caja de la sucursal abierta para desembolsar o liquidar contratos.
        </p>
      )}

      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => { setContractType('Pawn'); setItemId(''); }}
          className={`rounded-md px-3 py-2 text-sm ${contractType === 'Pawn' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}
        >
          Empeño
        </button>
        <button
          type="button"
          onClick={() => { setContractType('Sale'); setItemId(''); }}
          className={`rounded-md px-3 py-2 text-sm ${contractType === 'Sale' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}
        >
          Venta de mostrador
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Cliente…</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>{c.fullName}</option>
          ))}
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{contractType === 'Sale' ? 'Artículo en inventario…' : 'Artículo avaluado…'}</option>
          {(contractType === 'Sale' ? inStockItems : appraisedItems)?.map((i) => (
            <option key={i.id} value={i.id}>{i.description ?? i.id.slice(0, 8)}</option>
          ))}
        </select>
        <input
          value={purchaseValue}
          onChange={(e) => setPurchaseValue(e.target.value)}
          placeholder={contractType === 'Sale' ? 'Precio de venta' : 'Valor del préstamo'}
          type="number"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        {contractType === 'Pawn' ? (
          <>
            <input value={interestRatePct} onChange={(e) => setInterestRatePct(e.target.value)} placeholder="% de interés mensual" type="number" step="0.1" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
            {/* Opcional: si se deja vacío, el servidor aplica el plazo configurado
                (6 meses por defecto, RN-02) en vez de exigir que se teclee. */}
            <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" title="Vencimiento (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </>
        ) : (
          <input
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            placeholder="Descuento (opcional)"
            type="number"
            min={0}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        )}
        <button
          type="submit"
          disabled={createContract.isPending || !customerId || !itemId || !purchaseValue}
          className="col-span-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 md:col-span-1"
        >
          {contractType === 'Sale' ? 'Agregar al ticket' : 'Crear contrato'}
        </button>
        {contractType === 'Sale' && !register && (
          <p className="col-span-full text-xs text-amber-700">Se necesita la caja abierta para cobrar el ticket.</p>
        )}
      </form>

      {createContract.isError && (
        <p className="mb-4 text-sm text-red-600">{(createContract.error as ApiError).message}</p>
      )}

      {contractType === 'Sale' && cart.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">Ticket en curso</p>
          <table className="mb-3 w-full text-sm">
            <tbody>
              {cart.map((line, i) => (
                <tr key={`${line.itemId}-${i}`} className="border-b border-slate-100">
                  <td className="py-1 text-slate-700">{line.description}</td>
                  <td className="py-1 text-right text-slate-800">{formatCOP(line.principalAmount)}</td>
                  <td className="w-8 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeFromCart(i)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Quitar del ticket"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Total: {formatCOP(cartTotal)}</p>
            <div className="flex items-center gap-2">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => createSaleTicket.mutate()}
                disabled={!register || !customerId || createSaleTicket.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Cobrar ticket
              </button>
            </div>
          </div>
          {createSaleTicket.isError && (
            <p className="mt-2 text-sm text-red-600">{(createSaleTicket.error as ApiError).message}</p>
          )}
        </div>
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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${businessStatus(contract).tone}`}>
                    {businessStatus(contract).label}
                  </span>
                  {contract.dueDate && ` · vence ${new Date(contract.dueDate).toLocaleDateString('es-CO')}`}
                </p>
              </div>

              <div className="flex gap-2">
                {contract.status === 'Created' && (
                  <>
                    <button
                      onClick={() =>
                        setPendingAction({
                          title: 'Confirmar desembolso',
                          message: `¿Desembolsar ${formatCOP(contract.principalAmount)} de la caja? Esto mueve dinero real y no se puede deshacer.`,
                          onConfirm: () => disburseContract.mutate(contract.id),
                        })
                      }
                      disabled={!register}
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      Desembolsar
                    </button>
                    <button
                      onClick={() =>
                        setPendingAction({
                          title: 'Confirmar retiro',
                          message: 'Este contrato se retira: el cliente no se queda con el préstamo y no se puede deshacer.',
                          onConfirm: () => withdrawContract.mutate(contract.id),
                        })
                      }
                      className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Retirar
                    </button>
                  </>
                )}
                {contract.contractType === 'Sale' && contract.status === 'Settled' && (
                  <button
                    onClick={() =>
                      setPendingAction({
                        title: 'Confirmar devolución',
                        message: `¿Devolver esta venta por ${formatCOP(contract.principalAmount)}? Se reversa el dinero y el artículo vuelve a inventario para revisión.`,
                        onConfirm: () => returnSale.mutate(contract.id),
                      })
                    }
                    disabled={!register}
                    className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Devolver
                  </button>
                )}
                {['Active', 'Renewed', 'Overdue'].includes(contract.status) && (
                  // El cobro (intereses/abono/liquidación) vive en una sola
                  // pantalla — Cobro de mostrador — para no tener dos formas
                  // distintas de cobrar lo mismo con distinta calidad de UX.
                  <Link
                    to={`/cobro?q=${contract.contractNumber}`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cobrar
                  </Link>
                )}
                {/* Comprobante disponible para cualquier contrato que ya movió
                    caja — es lo mínimo que pide la auditoría para Sale, y no
                    cuesta nada extenderlo a los demás tipos ya liquidados. */}
                {contract.status !== 'Created' && contract.status !== 'Cancelled' && (
                  <button
                    onClick={() => setReceiptContractId(contract.id)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Comprobante
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {receiptContractId && (
        <Modal title="Comprobante" onClose={() => setReceiptContractId(null)}>
          <ReceiptLoader contractId={receiptContractId} />
        </Modal>
      )}

      {receiptTicketId && (
        <Modal title="Comprobante del ticket" onClose={() => setReceiptTicketId(null)}>
          <TicketReceiptLoader saleTicketId={receiptTicketId} />
        </Modal>
      )}

      {pendingAction && (
        <Modal title={pendingAction.title} onClose={() => setPendingAction(null)}>
          <p className="mb-4 text-sm text-slate-600">{pendingAction.message}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingAction(null)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                pendingAction.onConfirm();
                setPendingAction(null);
              }}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReceiptLoader({ contractId }: { contractId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['contract-receipt', contractId],
    queryFn: () => api.get<ReceiptData>(`/contracts/${contractId}/receipt`),
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Cargando comprobante…</p>;
  }
  if (error || !data) {
    return <p className="text-sm text-red-600">{(error as ApiError)?.message ?? 'No se pudo cargar el comprobante'}</p>;
  }
  return <Receipt data={data} />;
}

function TicketReceiptLoader({ saleTicketId }: { saleTicketId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sale-ticket-receipt', saleTicketId],
    queryFn: () => api.get<TicketReceiptData>(`/contracts/sale-tickets/${saleTicketId}/receipt`),
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Cargando comprobante…</p>;
  }
  if (error || !data) {
    return <p className="text-sm text-red-600">{(error as ApiError)?.message ?? 'No se pudo cargar el comprobante'}</p>;
  }
  return <TicketReceipt data={data} />;
}

