import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface Item {
  id: string;
  status: string;
  description: string | null;
}
interface SparePart {
  id: string;
  description: string;
  cost: string;
}
interface RepairOrder {
  id: string;
  status: string;
  diagnosis: string | null;
  totalCost: string;
  item: Item;
  spareParts: SparePart[];
}

const STATUS_LABELS: Record<string, string> = {
  Open: 'Abierta',
  Completed: 'Completada',
  Cancelled: 'Cancelada',
};

export function WorkshopPage() {
  const queryClient = useQueryClient();
  const { data: orders } = useQuery({ queryKey: ['repair-orders'], queryFn: () => api.get<RepairOrder[]>('/repair-orders') });
  const { data: stockItems } = useQuery({
    queryKey: ['items', 'InStock'],
    queryFn: () => api.get<Item[]>('/items?status=InStock'),
  });

  const [itemId, setItemId] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const createOrder = useMutation({
    mutationFn: () => api.post('/repair-orders', { itemId, diagnosis }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repair-orders'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setDiagnosis('');
    },
  });

  const [sparePartOrderId, setSparePartOrderId] = useState<string | null>(null);
  const [partDescription, setPartDescription] = useState('');
  const [partCost, setPartCost] = useState('');
  const addSparePart = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/repair-orders/${orderId}/spare-parts`, { description: partDescription, cost: Number(partCost) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repair-orders'] });
      setSparePartOrderId(null);
      setPartDescription('');
      setPartCost('');
    },
  });

  const completeOrder = useMutation({
    mutationFn: (orderId: string) => api.post(`/repair-orders/${orderId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repair-orders'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  function handleCreateOrder(e: FormEvent) {
    e.preventDefault();
    if (!itemId) return;
    createOrder.mutate();
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Taller</h2>

      <form onSubmit={handleCreateOrder} className="mb-6 flex gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Artículo disponible…</option>
          {stockItems?.map((i) => (
            <option key={i.id} value={i.id}>{i.description ?? i.id.slice(0, 8)}</option>
          ))}
        </select>
        <input
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Diagnóstico"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Enviar a taller
        </button>
      </form>

      <div className="space-y-2">
        {orders?.map((order) => (
          <div key={order.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{order.item.description ?? order.item.id.slice(0, 8)}</p>
                <p className="text-xs text-slate-500">
                  {order.diagnosis} · <span className="font-medium">{STATUS_LABELS[order.status] ?? order.status}</span> ·
                  costo total ${Number(order.totalCost).toLocaleString('es-CO')}
                </p>
              </div>
              {order.status === 'Open' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setSparePartOrderId(order.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    + Repuesto
                  </button>
                  <button
                    onClick={() => completeOrder.mutate(order.id)}
                    className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white"
                  >
                    Completar
                  </button>
                </div>
              )}
            </div>

            {order.spareParts.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {order.spareParts.map((p) => (
                  <li key={p.id}>{p.description} — ${Number(p.cost).toLocaleString('es-CO')}</li>
                ))}
              </ul>
            )}

            {sparePartOrderId === order.id && (
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <input
                  value={partDescription}
                  onChange={(e) => setPartDescription(e.target.value)}
                  placeholder="Descripción del repuesto"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <input
                  value={partCost}
                  onChange={(e) => setPartCost(e.target.value)}
                  placeholder="Costo"
                  type="number"
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => addSparePart.mutate(order.id)}
                  className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white"
                >
                  Agregar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
