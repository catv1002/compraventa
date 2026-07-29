import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { Modal } from '../components/Modal';

interface Reference {
  id: string;
  fullName: string;
  phone: string;
  relationship: string | null;
}
interface Customer {
  id: string;
  fullName: string;
  identificationNumber: string;
  type: string;
  phone: string;
  address: string;
  email: string | null;
  flagged: boolean;
  references: Reference[];
}

const EMPTY_FORM = {
  type: 'Individual',
  fullName: '',
  identificationNumber: '',
  phone: '',
  address: '',
  email: '',
  hasReference: false,
  refFullName: '',
  refPhone: '',
  refRelationship: '',
};

export function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const createCustomer = useMutation({
    mutationFn: () =>
      api.post('/customers', {
        type: form.type,
        fullName: form.fullName,
        identificationNumber: form.identificationNumber,
        phone: form.phone,
        address: form.address,
        email: form.email,
        reference: form.hasReference
          ? { fullName: form.refFullName, phone: form.refPhone, relationship: form.refRelationship || undefined }
          : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setForm(EMPTY_FORM);
      setIsModalOpen(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error al registrar el cliente'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createCustomer.mutate();
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Clientes</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nuevo cliente
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Dirección</th>
              <th className="px-4 py-2">Referencia</th>
              <th className="px-4 py-2">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {customers?.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{c.fullName}</td>
                <td className="px-4 py-2">{c.identificationNumber}</td>
                <td className="px-4 py-2">{c.phone}</td>
                <td className="px-4 py-2 max-w-[220px] truncate" title={c.address}>{c.address}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {c.references[0] ? `${c.references[0].fullName} · ${c.references[0].phone}` : '—'}
                </td>
                <td className="px-4 py-2">{c.flagged ? '⚠️' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal title="Registrar cliente" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => updateField('type', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Individual">Persona natural</option>
                <option value="Company">Empresa</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nombre completo</label>
                <input
                  value={form.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {form.type === 'Company' ? 'NIT' : 'Cédula'}
                </label>
                <input
                  value={form.identificationNumber}
                  onChange={(e) => updateField('identificationNumber', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="300 123 4567"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Dirección</label>
              <input
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="Dirección de residencia o negocio"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.hasReference}
                  onChange={(e) => updateField('hasReference', e.target.checked)}
                />
                Agregar contacto de referencia (opcional)
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Un segundo contacto para ubicar al cliente si no responde durante la vigencia de un contrato.
              </p>

              {form.hasReference && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
                    <input
                      value={form.refFullName}
                      onChange={(e) => updateField('refFullName', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      required={form.hasReference}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Teléfono</label>
                    <input
                      value={form.refPhone}
                      onChange={(e) => updateField('refPhone', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      required={form.hasReference}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Relación (opcional)</label>
                    <input
                      value={form.refRelationship}
                      onChange={(e) => updateField('refRelationship', e.target.value)}
                      placeholder="Familiar, cónyuge, compañero de trabajo…"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createCustomer.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {createCustomer.isPending ? 'Guardando…' : 'Registrar cliente'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
