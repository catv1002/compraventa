import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { formatCOP } from '../lib/format';

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
interface CloseRegisterResult {
  expectedCash: number;
  physicalCount: number;
  discrepancy: number;
}

export function CashPage() {
  const queryClient = useQueryClient();
  const { data: register } = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api.get<CashRegister | null>('/cash-registers/current'),
  });

  const [baseAmount, setBaseAmount] = useState('');
  const [physicalCount, setPhysicalCount] = useState('');
  const [closeResult, setCloseResult] = useState<CloseRegisterResult | null>(null);

  const openRegister = useMutation({
    mutationFn: () => api.post('/cash-registers/open', { baseAmount: Number(baseAmount) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-current'] }),
  });

  // La diferencia ya no se digita: el cajero solo cuenta el efectivo físico
  // del cajón y el servidor calcula cuánto debería haber contra sus propios
  // movimientos (`CashService.closeRegister`).
  const closeRegister = useMutation({
    mutationFn: () =>
      api.post<CloseRegisterResult>(`/cash-registers/${register?.id}/close`, {
        physicalCount: Number(physicalCount),
      }),
    onSuccess: (result) => {
      setCloseResult(result);
      setPhysicalCount('');
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
    },
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
      ) : null}

      {(openRegister.isError || closeRegister.isError) && (
        <p className="mt-2 text-sm text-red-600">
          {((openRegister.error ?? closeRegister.error) as ApiError).message}
        </p>
      )}

      {register && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Base</p>
              <p className="text-xl font-semibold">{formatCOP(register.baseAmount)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Ingresos</p>
              <p className="text-xl font-semibold text-emerald-600">{formatCOP(totalIn)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Egresos</p>
              <p className="text-xl font-semibold text-red-600">{formatCOP(totalOut)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-medium text-slate-700">Cierre / arqueo</h3>
            <p className="mb-2 text-xs text-slate-500">
              Cuenta el efectivo físico del cajón y escríbelo aquí — la diferencia la calcula el sistema, no la digites tú.
            </p>
            <div className="flex gap-2">
              <input
                value={physicalCount}
                onChange={(e) => setPhysicalCount(e.target.value)}
                placeholder="Efectivo contado en el cajón"
                type="number"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  if (physicalCount && window.confirm('¿Cerrar la caja con este conteo? No se puede deshacer.')) {
                    closeRegister.mutate();
                  }
                }}
                disabled={!physicalCount || closeRegister.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Cerrar caja
              </button>
            </div>
            {closeResult && (
              <div
                className={`mt-3 rounded-md p-3 text-sm ${
                  closeResult.discrepancy === 0
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-amber-50 text-amber-900'
                }`}
              >
                Esperado: {formatCOP(closeResult.expectedCash)} · Contado: {formatCOP(closeResult.physicalCount)} ·
                Diferencia: {formatCOP(closeResult.discrepancy)}
                {closeResult.discrepancy !== 0 && ' — queda pendiente de resolver antes de abrir la próxima caja.'}
              </div>
            )}
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
                    <td className="px-4 py-2">{formatCOP(m.amount)}</td>
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
