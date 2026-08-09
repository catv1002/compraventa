/**
 * Los ocho `ContractStatus` internos agrupados en los cinco estados con los
 * que razona el negocio, con color **y** texto (nada depende solo del
 * color). Antes vivía solo en PaymentsPage.tsx; ContractsPage.tsx mostraba
 * los 8 estados internos en texto plano sin color — mismo dato, dos
 * vocabularios visuales en la misma app. Ahora ambas pantallas usan esto.
 */
export function businessStatus(contract: {
  status: string;
  contractType: string;
}): { label: string; tone: string; operable: boolean } {
  switch (contract.status) {
    case 'Active':
    case 'Renewed':
      return { label: 'Vigente', tone: 'bg-slate-100 text-slate-700', operable: true };
    case 'Overdue':
    case 'Expired':
      return { label: 'Vencido', tone: 'bg-amber-100 text-amber-800', operable: true };
    case 'Created':
      return { label: 'Sin desembolsar', tone: 'bg-slate-100 text-slate-600', operable: false };
    case 'Settled':
      return { label: 'Liquidado', tone: 'bg-emerald-100 text-emerald-800', operable: false };
    case 'Forfeited':
      return { label: 'Joya rematada', tone: 'bg-red-100 text-red-700', operable: false };
    case 'Cancelled':
      return {
        label: contract.contractType === 'Sale' ? 'Devuelto' : contract.contractType === 'Layaway' ? 'Anulado' : 'Retirado',
        tone: 'bg-slate-200 text-slate-500',
        operable: false,
      };
    default:
      return { label: contract.status, tone: 'bg-slate-100 text-slate-700', operable: false };
  }
}
