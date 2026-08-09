import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { formatCOP } from '../lib/format';

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

interface BalanceRow {
  code: string;
  name: string;
  type: string;
  balance: number;
}
interface BalanceSheet {
  asOf: string;
  activos: BalanceRow[];
  pasivos: BalanceRow[];
  patrimonio: BalanceRow[];
  resultadoDelEjercicio: number;
  totalActivos: number;
  totalPasivos: number;
  totalPatrimonio: number;
  cuadra: boolean;
}

function BalanceColumn({ titulo, rows, extra, total }: { titulo: string; rows: BalanceRow[]; extra?: { label: string; valor: number }; total: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{titulo}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-slate-100">
              <td className="py-1.5 text-slate-600">{r.code} — {r.name}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCOP(r.balance)}</td>
            </tr>
          ))}
          {extra && (
            <tr className="border-t border-slate-100 text-slate-500">
              <td className="py-1.5 italic">{extra.label}</td>
              <td className="py-1.5 text-right italic tabular-nums">{formatCOP(extra.valor)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
        <span>Total</span>
        <span className="tabular-nums">{formatCOP(total)}</span>
      </div>
    </div>
  );
}

export function AccountingPage() {
  const { data } = useQuery({ queryKey: ['income-statement'], queryFn: () => api.get<IncomeStatement>('/accounting/income-statement') });
  const { data: balance } = useQuery({
    queryKey: ['balance-sheet'],
    queryFn: () => api.get<BalanceSheet>('/accounting/balance-sheet'),
  });

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

      {balance && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Balance general</h3>
            <span className="text-xs text-slate-500">Corte al {balance.asOf}</span>
          </div>
          {!balance.cuadra && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              El balance no cuadra: Activo {formatCOP(balance.totalActivos)} ≠ Pasivo + Patrimonio{' '}
              {formatCOP(balance.totalPasivos + balance.totalPatrimonio)}. Revisa los asientos.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <BalanceColumn titulo="Activo" rows={balance.activos} total={balance.totalActivos} />
            <BalanceColumn titulo="Pasivo" rows={balance.pasivos} total={balance.totalPasivos} />
            <BalanceColumn
              titulo="Patrimonio"
              rows={balance.patrimonio}
              extra={{ label: 'Resultado del ejercicio (no cerrado)', valor: balance.resultadoDelEjercicio }}
              total={balance.totalPatrimonio}
            />
          </div>
        </div>
      )}
    </div>
  );
}
