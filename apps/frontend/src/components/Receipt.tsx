import { formatCOP, formatDate } from '../lib/format';

/**
 * Datos del comprobante — reflejan lo que devuelve `GET /contracts/:id/receipt`.
 * No es una factura DIAN: es el papel que se lleva el cliente de mostrador.
 * Ver ContractsService.getReceiptData.
 */
export interface ReceiptData {
  contractId: string;
  contractNumber: number;
  contractType: string;
  date: string;
  branchName: string;
  customer: { fullName: string; identificationNumber: string };
  item: {
    description: string | null;
    category: string | null;
    attributes: { key: string; value: string }[];
  };
  principalAmount: number;
  discountAmount: number | null;
  listPrice: number | null;
  paymentMethod: string | null;
  operatorName: string | null;
}

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  Pawn: 'Compraventa con pacto de retroventa',
  DirectPurchase: 'Compra directa',
  Sale: 'Venta de mostrador',
  Layaway: 'Plan Separe',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  Cash: 'Efectivo',
  Transfer: 'Transferencia',
  Card: 'Tarjeta',
  Other: 'Otro',
};

/**
 * Comprobante imprimible. `window.print()` es deliberado — no se añadió una
 * librería de PDF para esto (fuera de alcance, ver auditoría de venta).
 * El botón "Imprimir" queda oculto en la hoja impresa vía `print:hidden`.
 */
export function Receipt({ data }: { data: ReceiptData }) {
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
          <p className="font-semibold text-slate-900">{data.branchName}</p>
          <p className="text-xs text-slate-500">{CONTRACT_TYPE_LABELS[data.contractType] ?? data.contractType}</p>
          <p className="mt-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs inline-block">
            Contrato N.º {data.contractNumber}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(data.date)}</p>
        </div>

        <hr className="border-dashed border-slate-300" />

        <div>
          <p className="text-xs uppercase text-slate-400">Cliente</p>
          <p>{data.customer.fullName}</p>
          <p className="text-xs text-slate-500">C.C./NIT {data.customer.identificationNumber}</p>
        </div>

        <div>
          <p className="text-xs uppercase text-slate-400">Artículo</p>
          <p>{data.item.description ?? 'Sin descripción'}</p>
          {data.item.category && <p className="text-xs text-slate-500">{data.item.category}</p>}
          {data.item.attributes.length > 0 && (
            <p className="text-xs text-slate-500">
              {data.item.attributes.map((a) => `${a.key}: ${a.value}`).join(' · ')}
            </p>
          )}
        </div>

        <hr className="border-dashed border-slate-300" />

        <div className="space-y-1">
          {data.listPrice !== null && data.discountAmount !== null && data.discountAmount > 0 && (
            <>
              <Row label="Precio de lista" value={formatCOP(data.listPrice)} />
              <Row label="Descuento" value={`- ${formatCOP(data.discountAmount)}`} />
            </>
          )}
          <Row label="Total" value={formatCOP(data.principalAmount)} strong />
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

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
