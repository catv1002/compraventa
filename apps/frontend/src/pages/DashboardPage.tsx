import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface Item {
  id: string;
  status: string;
}
interface Contract {
  id: string;
  status: string;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const items = useQuery({ queryKey: ['items'], queryFn: () => api.get<Item[]>('/items') });
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: () => api.get<Contract[]>('/contracts') });

  const inStock = items.data?.filter((i) => i.status === 'InStock').length ?? 0;
  const inPledge = items.data?.filter((i) => i.status === 'InPledgeCustody').length ?? 0;
  const activeContracts = contracts.data?.filter((c) => ['Active', 'Renewed'].includes(c.status)).length ?? 0;
  const overdueContracts = contracts.data?.filter((c) => ['Overdue', 'Expired'].includes(c.status)).length ?? 0;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Panel general</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Inventario disponible" value={inStock} />
        <StatTile label="Inventario comprometido (empeño)" value={inPledge} />
        <StatTile label="Contratos activos" value={activeContracts} />
        <StatTile label="Contratos en mora/vencidos" value={overdueContracts} />
      </div>
      <p className="mt-6 text-sm text-slate-400">
        Panel simplificado de Fase 1. El dashboard ejecutivo completo (docs/04-kpis-y-dashboards.md) llega en
        Fase 3 vía el BFF GraphQL.
      </p>
    </div>
  );
}
