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
  status: string;
  contractType: string;
  principalAmount: string;
  paidAmount: string;
  customer: Customer;
  item: Item;
}
interface CashRegister {
  id: string;
}

const STATUS_LABELS: Record<string, string> = {
  Active: 'Activo',
  Settled: 'Completado',
  Cancelled: 'Cancelado',
};

export function LayawayPage() {
  const queryClient = useQueryClient();
  const { data: contracts } = useQuery({
    queryKey: ['contracts', 'layaway'],
    queryFn: async () => (await api.get<Contract[]>('/contracts')).filter((c) => c.contractType === 'Layaway'),
  });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });
  const { data: stockItems } = useQuery({
    queryKey: ['items', 'InStock'],
    queryFn: () => api.get<Item[]>('/items?status=InStock'),
  });
  const { data: register } = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<CashRegister | null>('/cash-registers/current'),
  });

  const [customerId, setCustomerId] = useState('');
  const [itemId, setItemId] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');

  const createLayaway = useMutation({
    mutationFn: () =>
      api.post('/contracts', {
        contractType: 'Layaway',
        customerId,
        itemId,
        principalAmount: Number(principalAmount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setPrincipalAmount('');
    },
  });

  const [installmentContractId, setInstallmentContractId] = useState<string | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const payInstallment = useMutation({
    mutationFn: (contractId: string) =>
      api.post(`/contracts/${contractId}/installment`, {
        amount: Number(installmentAmount),
        cashRegisterId: register?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setInstallmentContractId(null);
      setInstallmentAmount('');
    },
  });

  const cancelLayaway = useMutation({
    mutationFn: (contractId: string) => api.post(`/contracts/${contractId}/cancel-layaway`, { penaltyAmount: 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId || !itemId) return;
    createLayaway.mutate();
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Plan Separe</h2>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Cliente…</option>
          {customers?.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Artículo disponible…</option>
          {stockItems?.map((i) => <option key={i.id} value={i.id}>{i.description ?? i.id.slice(0, 8)}</option>)}
        </select>
        <input
          value={principalAmount}
          onChange={(e) => setPrincipalAmount(e.target.value)}
          placeholder="Precio total pactado"
          type="number"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Apartar
        </button>
      </form>

      {(createLayaway.isError || payInstallment.isError || cancelLayaway.isError) && (
        <p className="mb-4 text-sm text-red-600">
          {((createLayaway.error ?? payInstallment.error ?? cancelLayaway.error) as ApiError).message}
        </p>
      )}

      <div className="space-y-2">
        {contracts?.map((c) => {
          const progress = (Number(c.paidAmount) / Number(c.principalAmount)) * 100;
          return (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{c.customer.fullName} · {c.item.description ?? 'Artículo'}</p>
                  <p className="text-xs text-slate-500">
                    {formatCOP(c.paidAmount)} / {formatCOP(c.principalAmount)} ·{' '}
                    <span className="font-medium">{STATUS_LABELS[c.status] ?? c.status}</span>
                  </p>
                </div>
                {c.status === 'Active' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInstallmentContractId(c.id)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Abonar
                    </button>
                    <button
                      onClick={() => cancelLayaway.mutate(c.id)}
                      className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-slate-900" style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              {installmentContractId === c.id && (
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <input
                    value={installmentAmount}
                    onChange={(e) => setInstallmentAmount(e.target.value)}
                    placeholder="Monto del abono"
                    type="number"
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => payInstallment.mutate(c.id)}
                    className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white"
                  >
                    Registrar abono
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
