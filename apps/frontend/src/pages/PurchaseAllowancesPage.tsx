import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { formatCOP } from '../lib/format';
import { useAuth } from '../lib/auth-context';

interface Allowance {
  userId: string;
  assignedAmount: number | string;
  spentAmount: number | string;
  availableAmount: number;
}

interface AllowanceWithUser extends Allowance {
  id: string;
  user: { id: string; fullName: string; role: string };
}

interface Candidate {
  id: string;
  fullName: string;
  role: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function PurchaseAllowancesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canAssign = user?.role === 'BranchManager' || user?.role === 'Admin';

  const { data: mine } = useQuery({
    queryKey: ['purchase-allowance-mine'],
    queryFn: () => api.get<Allowance>('/purchase-allowances/me'),
  });

  const { data: candidates } = useQuery({
    queryKey: ['purchase-allowance-candidates', user?.homeBranchId],
    queryFn: () => api.get<Candidate[]>(`/purchase-allowances/branch/${user?.homeBranchId}/candidates`),
    enabled: canAssign,
  });

  const { data: branchAllowances } = useQuery({
    queryKey: ['purchase-allowance-branch', user?.homeBranchId],
    queryFn: () => api.get<AllowanceWithUser[]>(`/purchase-allowances/branch/${user?.homeBranchId}`),
    enabled: canAssign,
  });

  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignedAmount, setAssignedAmount] = useState('');

  const assign = useMutation({
    mutationFn: () =>
      api.post('/purchase-allowances', {
        userId: selectedUserId,
        date: todayISO(),
        assignedAmount: Number(assignedAmount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-allowance-branch'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-allowance-mine'] });
      setSelectedUserId('');
      setAssignedAmount('');
    },
  });

  function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId || !assignedAmount) return;
    assign.mutate();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Cupo de compra diario</h2>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Tu cupo de hoy</p>
        {mine ? (
          <div className="mt-2 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500">Asignado</p>
              <p className="text-lg font-semibold">{formatCOP(mine.assignedAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Gastado</p>
              <p className="text-lg font-semibold text-red-600">{formatCOP(mine.spentAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Disponible</p>
              <p className="text-lg font-semibold text-emerald-600">
                {formatCOP(mine.availableAmount)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Cargando…</p>
        )}
        {mine && Number(mine.assignedAmount) === 0 && (
          <p className="mt-2 text-sm text-amber-600">
            No tienes cupo asignado para hoy. Pide a tu jefe de sucursal que te lo asigne.
          </p>
        )}
      </div>

      {canAssign && (
        <>
          <form
            onSubmit={handleAssign}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div>
              <label className="block text-xs text-slate-500">Vendedor / cajero</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Selecciona…</option>
                {candidates?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500">Cupo de hoy</label>
              <input
                value={assignedAmount}
                onChange={(e) => setAssignedAmount(e.target.value)}
                placeholder="Ej. 5000000"
                type="number"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={assign.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Asignar
            </button>
            {assign.isError && (
              <p className="w-full text-sm text-red-600">{(assign.error as Error).message}</p>
            )}
          </form>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Asignado</th>
                  <th className="px-4 py-2">Gastado</th>
                  <th className="px-4 py-2">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {branchAllowances?.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{a.user.fullName}</td>
                    <td className="px-4 py-2">{a.user.role}</td>
                    <td className="px-4 py-2">{formatCOP(a.assignedAmount)}</td>
                    <td className="px-4 py-2 text-red-600">{formatCOP(a.spentAmount)}</td>
                    <td className="px-4 py-2 text-emerald-600">
                      {formatCOP(a.availableAmount)}
                    </td>
                  </tr>
                ))}
                {branchAllowances?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      Nadie tiene cupo asignado hoy todavía.
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
