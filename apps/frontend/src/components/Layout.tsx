import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

const NAV_ITEMS = [
  { to: '/', label: 'Panel', end: true },
  { to: '/clientes', label: 'Clientes' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/contratos', label: 'Contratos' },
  { to: '/cobro', label: 'Cobro' },
  { to: '/plan-separe', label: 'Plan Separe' },
  { to: '/taller', label: 'Taller' },
  { to: '/caja', label: 'Caja' },
  { to: '/libro-caja', label: 'Libro de caja' },
  { to: '/remate', label: 'Remate' },
  { to: '/cartera', label: 'Cartera' },
  { to: '/contabilidad', label: 'Contabilidad' },
  { to: '/sucursales', label: 'Sucursales' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <h1 className="mb-6 text-lg font-semibold text-slate-800">Compraventa</h1>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">
            {user?.fullName} · {user?.role} · Sede {user?.homeBranchId}
            {!user?.mfaEnabled && (
              <NavLink to="/perfil/mfa" className="ml-2 text-amber-600 hover:underline">
                (activar MFA)
              </NavLink>
            )}
          </span>
          <button onClick={logout} className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Cerrar sesión
          </button>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
