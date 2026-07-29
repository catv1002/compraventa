import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface CashMovement {
  id: string;
  type: string;
  amount: string;
  sourceType: string;
}
interface CashRegister {
  id: string;
  baseAmount: string;
  status: string;
  movements: CashMovement[];
}

export function CashPage() {
  const queryClient = useQueryClient();
  const { data: register } = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<CashRegister | null>('/cash-registers/current'),
  });

  const [baseAmount, setBaseAmount] = useState('');
  const [discrepancy, setDiscrepancy] = useState('0');

  const openRegister = useMutation({
    mutationFn: () => api.post('/cash-registers/open', { baseAmount: Number(baseAmount) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-current'] }),
  });

  const closeRegister = useMutation({
    mutationFn: () =>
      api.post(`/cash-registers/${register?.id}/close`, { discrepancy: Number(discrepancy) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-current'] }),
  });

  function handleOpen(e: FormEvent) {
    e.preventDefault();
    openRegister.mutate();
  }

  const totalIn = register?.movements
    .filter((m) => m.type === 'CashIn')
    .reduce((sum, m) => sum + Number(m.amount), 0) ?? 0;
  const totalOut = register?.movements
    .filter((m) => m.type === 'CashOut')
    .reduce((sum, m) => sum + Number(m.amount), 0) ?? 0;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Caja</h2>

      {!register ? (
        <form onSubmit={handleOpen} className="flex gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <input
            value={baseAmount}
            onChange={(e) => setBaseAmount(e.target.value)}
            placeholder="Monto base de apertura"
            type="number"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Abrir caja
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Base</p>
              <p className="text-xl font-semibold">${Number(register.baseAmount).toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Ingresos</p>
              <p className="text-xl font-semibold text-emerald-600">${totalIn.toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Egresos</p>
              <p className="text-xl font-semibold text-red-600">${totalOut.toLocaleString('es-CO')}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-medium text-slate-700">Cierre / arqueo</h3>
            <div className="flex gap-2">
              <input
                value={discrepancy}
                onChange={(e) => setDiscrepancy(e.target.value)}
                placeholder="Diferencia detectada"
                type="number"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() => closeRegister.mutate()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Cerrar caja
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Origen</th>
                  <th className="px-4 py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {register.movements.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{m.type === 'CashIn' ? 'Ingreso' : 'Egreso'}</td>
                    <td className="px-4 py-2">{m.sourceType}</td>
                    <td className="px-4 py-2">${Number(m.amount).toLocaleString('es-CO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
