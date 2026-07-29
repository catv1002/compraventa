import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface IncomeRow {
  code: string;
  name: string;
  type: string;
  balance: number;
}
interface IncomeStatement {
  rows: IncomeRow[];
  revenue: number;
  expense: number;
  netIncome: number;
}

export function AccountingPage() {
  const { data } = useQuery({ queryKey: ['income-statement'], queryFn: () => api.get<IncomeStatement>('/accounting/income-statement') });

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Contabilidad</h2>
      <p className="mb-6 text-sm text-slate-500">
        Asientos generados automáticamente a partir de eventos de negocio (desembolsos, intereses,
        liquidaciones, ventas, reparaciones) — ver docs/03-dominios-ddd.md, Contabilidad.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Ingresos</p>
          <p className="text-xl font-semibold text-emerald-600">${(data?.revenue ?? 0).toLocaleString('es-CO')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Costos</p>
          <p className="text-xl font-semibold text-red-600">${(data?.expense ?? 0).toLocaleString('es-CO')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Utilidad neta</p>
          <p className="text-xl font-semibold">${(data?.netIncome ?? 0).toLocaleString('es-CO')}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.code} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.code} — {r.name}</td>
                <td className="px-4 py-2">{r.type}</td>
                <td className="px-4 py-2">${r.balance.toLocaleString('es-CO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
