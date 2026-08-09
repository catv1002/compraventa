import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

// `roles` ausente = visible para cualquier rol autenticado. Cuando se declara,
// debe reflejar los mismos roles que protegen el endpoint en el backend
// (ver @Roles en el controller correspondiente) — ocultar el link es solo UX,
// la autorización real vive en el servidor.
const NAV_ITEMS: { to: string; label: string; end?: boolean; roles?: string[] }[] = [
  { to: '/', label: 'Panel', end: true },
  { to: '/clientes', label: 'Clientes' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/contratos', label: 'Contratos' },
  { to: '/cobro', label: 'Cobro' },
  { to: '/plan-separe', label: 'Plan Separe' },
  { to: '/taller', label: 'Taller' },
  { to: '/caja', label: 'Caja' },
  { to: '/cupo-compra', label: 'Cupo de compra' },
  { to: '/libro-caja', label: 'Libro de caja' },
  { to: '/remate', label: 'Remate' },
  {
    to: '/cartera',
    label: 'Cartera',
    roles: ['BranchManager', 'Admin'],
  },
  { to: '/cierre-del-dia', label: 'Cierre del día', roles: ['BranchManager', 'Admin'] },
  { to: '/reportes', label: 'Reportes', roles: ['BranchManager', 'Admin'] },
  { to: '/migracion', label: 'Migración', roles: ['BranchManager', 'Admin'] },
  { to: '/contabilidad', label: 'Contabilidad', roles: ['Admin'] },
  { to: '/sucursales', label: 'Sucursales' },
  { to: '/usuarios', label: 'Usuarios', roles: ['Admin'] },
  { to: '/configuracion', label: 'Configuración', roles: ['Admin'] },
  { to: '/auditoria', label: 'Auditoría', roles: ['Admin'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role ?? ''));

  return (
    <div className="flex min-h-screen">
      {/* Fondo oscuro detrás del menú en pantallas angostas — clic para cerrar.
          En md+ nunca se renderiza (el sidebar ya está fijo). */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 transform border-r border-slate-200 bg-white p-4 transition-transform duration-200 ease-in-out md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">Compraventa</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
            className="text-slate-400 hover:text-slate-700 md:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
              className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 md:hidden"
            >
              ☰
            </button>
            <span className="text-sm text-slate-500">
              {user?.fullName} · {user?.role} · Sede {user?.homeBranchId}
              {!user?.mfaEnabled && (
                <NavLink to="/perfil/mfa" className="ml-2 text-amber-600 hover:underline">
                  (activar MFA)
                </NavLink>
              )}
            </span>
          </div>
          <button onClick={logout} className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Cerrar sesión
          </button>
        </header>
        <main className="overflow-x-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
