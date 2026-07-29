import { AccountType } from '@prisma/client';

// Plan de cuentas mínimo para Fase 2 — ver docs/03-dominios-ddd.md (7. Contabilidad).
// Se siembra por tenant en prisma/seed.ts; el código es la clave estable que usa
// AccountingService para no depender de IDs.
export const CHART_OF_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'Caja', type: AccountType.Asset },
  { code: '1100', name: 'Cartera de préstamos (empeño)', type: AccountType.Asset },
  { code: '1200', name: 'Inventario de mercancías', type: AccountType.Asset },
  { code: '2000', name: 'Cuentas por pagar (repuestos/proveedores)', type: AccountType.Liability },
  { code: '4000', name: 'Ingresos por venta', type: AccountType.Revenue },
  { code: '4100', name: 'Ingresos financieros (intereses)', type: AccountType.Revenue },
  { code: '5000', name: 'Costo de ventas', type: AccountType.Expense },
];
