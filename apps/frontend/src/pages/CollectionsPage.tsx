import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { formatCOP } from '../lib/format';

interface Customer {
  id: string;
  fullName: string;
}
interface Contract {
  id: string;
  status: string;
  principalAmount: string;
  dueDate: string | null;
  customer: Customer;
}
interface RecoveryRate {
  settled: number;
  dueInPast: number;
  recoveryRate: number | null;
}

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const { data: upcoming } = useQuery({ queryKey: ['collections-upcoming'], queryFn: () => api.get<Contract[]>('/collections/upcoming?days=7') });
  const { data: overdue } = useQuery({ queryKey: ['collections-overdue'], queryFn: () => api.get<Contract[]>('/collections/overdue') });
  const { data: recovery } = useQuery({ queryKey: ['collections-recovery'], queryFn: () => api.get<RecoveryRate>('/collections/recovery-rate') });

  const [contactContractId, setContactContractId] = useState<string | null>(null);
  const [channel, setChannel] = useState('Llamada');
  const [notes, setNotes] = useState('');
  const logContact = useMutation({
    mutationFn: (contractId: string) => api.post(`/collections/${contractId}/contact`, { channel, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections-overdue'] });
      setContactContractId(null);
      setNotes('');
    },
  });

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Vencen en 7 días</p>
          <p className="text-2xl font-semibold">{upcoming?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">En mora</p>
          <p className="text-2xl font-semibold">{overdue?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Recuperación de cartera</p>
          <p className="text-2xl font-semibold">
            {recovery?.recoveryRate == null ? '—' : `${Math.round(recovery.recoveryRate * 100)}%`}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Próximos a vencer</h3>
        <div className="space-y-2">
          {upcoming?.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              {c.customer.fullName} — {formatCOP(c.principalAmount)} — vence{' '}
              {c.dueDate && new Date(c.dueDate).toLocaleDateString('es-CO')}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">En mora</h3>
        <div className="space-y-2">
          {overdue?.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {c.customer.fullName} — {formatCOP(c.principalAmount)}
                </span>
                <button
                  onClick={() => setContactContractId(c.id)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Registrar contacto
                </button>
              </div>
              {contactContractId === c.id && (
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option>Llamada</option>
                    <option>WhatsApp</option>
                    <option>SMS</option>
                    <option>Visita</option>
                  </select>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas"
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => logContact.mutate(c.id)}
                    className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white"
                  >
                    Guardar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
