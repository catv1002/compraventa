import { formatCOP, formatDate } from '../lib/format';
import { PAYMENT_METHOD_LABELS, Row, type ReceiptData } from './Receipt';

/**
 * Comprobante combinado de un ticket de venta multi-artículo — reúne varios
 * `ReceiptData` (uno por Contract) bajo un mismo `saleTicketId`. Refleja lo
 * que devuelve `GET /contracts/sale-tickets/:saleTicketId/receipt`. Cada
 * artículo sigue siendo su propio Contract con su propio N.º; este recibo
 * solo los agrupa para el papel que se lleva el cliente.
 */
export interface TicketReceiptData {
  saleTicketId: string;
  items: ReceiptData[];
  totalPrincipal: number;
  totalDiscount: number;
  totalCharged: number;
  paymentMethod: string | null;
  customer: { fullName: string; identificationNumber: string };
  branch: string;
  operatorName: string | null;
  createdAt: string;
}

export function TicketReceipt({ data }: { data: TicketReceiptData }) {
  return (
    <div className="mx-auto max-w-sm text-sm text-slate-800">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Imprimir
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-4">
        <div className="text-center">
          <p className="font-semibold text-slate-900">{data.branch}</p>
          <p className="text-xs text-slate-500">Venta de mostrador — ticket</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(data.createdAt)}</p>
        </div>

        <hr className="border-dashed border-slate-300" />

        <div>
          <p className="text-xs uppercase text-slate-400">Cliente</p>
          <p>{data.customer.fullName}</p>
          <p className="text-xs text-slate-500">C.C./NIT {data.customer.identificationNumber}</p>
        </div>

        <hr className="border-dashed border-slate-300" />

        <div className="space-y-2">
          {data.items.map((item) => (
            <div key={item.contractId} className="flex items-start justify-between text-xs">
              <div>
                <p className="rounded bg-slate-100 px-1 py-0.5 font-mono inline-block">N.º {item.contractNumber}</p>
                <p className="text-slate-700">{item.item.description ?? 'Artículo'}</p>
              </div>
              <p className="font-medium text-slate-800">{formatCOP(item.principalAmount)}</p>
            </div>
          ))}
        </div>

        <hr className="border-dashed border-slate-300" />

        <div className="space-y-1">
          {data.totalDiscount > 0 && (
            <Row label="Descuento total" value={`- ${formatCOP(data.totalDiscount)}`} />
          )}
          <Row label="Total del ticket" value={formatCOP(data.totalCharged)} strong />
          <Row
            label="Medio de pago"
            value={data.paymentMethod ? (PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod) : '—'}
          />
        </div>

        <hr className="border-dashed border-slate-300" />

        <p className="text-center text-xs text-slate-500">
          Atendió: {data.operatorName ?? 'No registrado'}
        </p>
      </div>
    </div>
  );
}
