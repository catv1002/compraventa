import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { Modal } from '../components/Modal';

interface Branch {
  id: string;
  name: string;
}
interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  active: boolean;
  homeBranchId: string;
  homeBranch: { id: string; name: string };
}

// Mismos valores que el enum UserRole de prisma/schema.prisma.
const ROLES = ['SalesAdvisor', 'BranchManager', 'Admin'];

const ROLE_LABELS: Record<string, string> = {
  SalesAdvisor: 'Asesor de ventas',
  BranchManager: 'Jefe de sucursal',
  Admin: 'Administrador',
};

const EMPTY_FORM = {
  email: '',
  fullName: '',
  password: '',
  role: 'SalesAdvisor',
  homeBranchId: '',
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/branches') });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeactivateUser, setPendingDeactivateUser] = useState<User | null>(null);

  const createUser = useMutation({
    mutationFn: () =>
      api.post('/users', {
        email: form.email,
        fullName: form.fullName,
        password: form.password,
        role: form.role,
        homeBranchId: form.homeBranchId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error al crear el usuario'),
  });

  const updateUser = useMutation({
    mutationFn: () =>
      api.patch(`/users/${editingUser!.id}`, {
        fullName: form.fullName,
        role: form.role,
        homeBranchId: form.homeBranchId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error al actualizar el usuario'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Error al cambiar el estado del usuario'),
  });

  function openCreateModal() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError(null);
    setIsModalOpen(true);
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setForm({ email: user.email, fullName: user.fullName, password: '', role: user.role, homeBranchId: user.homeBranchId });
    setError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.homeBranchId) return;
    if (editingUser) {
      updateUser.mutate();
    } else {
      createUser.mutate();
    }
  }

  function handleToggleActive(user: User) {
    if (user.active) {
      setPendingDeactivateUser(user);
      return;
    }
    toggleActive.mutate({ id: user.id, active: !user.active });
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const saving = createUser.isPending || updateUser.isPending;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Usuarios</h2>
        <button
          onClick={openCreateModal}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nuevo usuario
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{u.fullName}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="px-4 py-2">{u.homeBranch?.name}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEditModal(u)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={toggleActive.isPending}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal title={editingUser ? 'Editar usuario' : 'Nuevo usuario'} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                required
                disabled={!!editingUser}
              />
              {editingUser && <p className="mt-1 text-xs text-slate-500">El correo no se puede cambiar desde aquí.</p>}
            </div>

            {!editingUser && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  minLength={8}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => updateField('role', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Sucursal</label>
                <select
                  value={form.homeBranchId}
                  onChange={(e) => updateField('homeBranchId', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecciona…</option>
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDeactivateUser && (
        <Modal title="Confirmar desactivación" onClose={() => setPendingDeactivateUser(null)}>
          <p className="mb-4 text-sm text-slate-600">
            ¿Desactivar a {pendingDeactivateUser.fullName}? No podrá iniciar sesión.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingDeactivateUser(null)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                toggleActive.mutate({ id: pendingDeactivateUser.id, active: false });
                setPendingDeactivateUser(null);
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
