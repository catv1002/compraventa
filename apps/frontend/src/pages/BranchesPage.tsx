import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Modal } from '../components/Modal';

interface Branch {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}
interface Item {
  id: string;
  status: string;
  description: string | null;
}
interface Transfer {
  id: string;
  status: string;
  item: Item;
  fromBranch: Branch;
  toBranch: Branch;
}

const TRANSFER_LABELS: Record<string, string> = {
  Requested: 'Solicitado',
  InTransit: 'En tránsito',
  Received: 'Recibido',
  Cancelled: 'Cancelado',
};

export function BranchesPage() {
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/branches') });
  const { data: transfers } = useQuery({ queryKey: ['transfers'], queryFn: () => api.get<Transfer[]>('/transfers') });
  const { data: stockItems } = useQuery({
    queryKey: ['items', 'InStock'],
    queryFn: () => api.get<Item[]>('/items?status=InStock'),
  });

  const [branchName, setBranchName] = useState('');
  const createBranch = useMutation({
    mutationFn: () => api.post('/branches', { name: branchName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setBranchName('');
    },
  });

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editActive, setEditActive] = useState(true);

  function openEdit(b: Branch) {
    setEditingBranch(b);
    setEditName(b.name);
    setEditAddress(b.address ?? '');
    setEditActive(b.active);
  }

  const updateBranch = useMutation({
    mutationFn: () =>
      api.patch(`/branches/${editingBranch?.id}`, {
        name: editName,
        address: editAddress,
        active: editActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setEditingBranch(null);
    },
  });

  function handleUpdateBranch(e: FormEvent) {
    e.preventDefault();
    updateBranch.mutate();
  }

  const [transferItemId, setTransferItemId] = useState('');
  const [transferToBranch, setTransferToBranch] = useState('');
  const createTransfer = useMutation({
    mutationFn: () => api.post('/transfers', { itemId: transferItemId, toBranchId: transferToBranch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setTransferItemId('');
    },
  });

  const dispatchTransfer = useMutation({
    mutationFn: (id: string) => api.post(`/transfers/${id}/dispatch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transfers'] }),
  });
  const receiveTransfer = useMutation({
    mutationFn: (id: string) => api.post(`/transfers/${id}/receive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  function handleCreateBranch(e: FormEvent) {
    e.preventDefault();
    createBranch.mutate();
  }

  function handleCreateTransfer(e: FormEvent) {
    e.preventDefault();
    if (!transferItemId || !transferToBranch) return;
    createTransfer.mutate();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Sucursales</h2>
        <form onSubmit={handleCreateBranch} className="mb-4 flex gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <input
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="Nombre de la sucursal"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Crear sucursal
          </button>
        </form>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {branches?.map((b) => (
            <div key={b.id} className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div>
                <p className="font-medium text-slate-800">
                  {b.name}
                  {!b.active && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Inactiva
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{b.address}</p>
              </div>
              <button
                onClick={() => openEdit(b)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                Editar
              </button>
            </div>
          ))}
        </div>
      </div>

      {editingBranch && (
        <Modal title="Editar sucursal" onClose={() => setEditingBranch(null)}>
          <form onSubmit={handleUpdateBranch} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Dirección</label>
              <input
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              Sucursal activa
            </label>
            {updateBranch.isError && (
              <p className="text-sm text-red-600">
                {(updateBranch.error as any)?.message ?? 'No se pudo guardar la sucursal'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingBranch(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Traslados entre sucursales</h2>
        <form onSubmit={handleCreateTransfer} className="mb-4 flex gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <select
            value={transferItemId}
            onChange={(e) => setTransferItemId(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Artículo disponible…</option>
            {stockItems?.map((i) => (
              <option key={i.id} value={i.id}>{i.description ?? i.id.slice(0, 8)}</option>
            ))}
          </select>
          <select
            value={transferToBranch}
            onChange={(e) => setTransferToBranch(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sucursal destino…</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Solicitar traslado
          </button>
        </form>

        <div className="space-y-2">
          {transfers?.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <p className="font-medium text-slate-800">{t.item.description ?? t.item.id.slice(0, 8)}</p>
                <p className="text-xs text-slate-500">
                  {t.fromBranch.name} → {t.toBranch.name} ·{' '}
                  <span className="font-medium">{TRANSFER_LABELS[t.status] ?? t.status}</span>
                </p>
              </div>
              <div className="flex gap-2">
                {t.status === 'Requested' && (
                  <button
                    onClick={() => dispatchTransfer.mutate(t.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Despachar
                  </button>
                )}
                {t.status === 'InTransit' && (
                  <button
                    onClick={() => receiveTransfer.mutate(t.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Recibir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
