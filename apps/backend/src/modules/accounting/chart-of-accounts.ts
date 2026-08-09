import { AccountType } from '@prisma/client';

// Plan de cuentas mínimo para Fase 2 — ver docs/03-dominios-ddd.md (7. Contabilidad).
// Se siembra por tenant en prisma/seed.ts; el código es la clave estable que usa
// AccountingService para no depender de IDs.
//
// ⚠️ PENDIENTE — IVA (Fase 7, sin resolver, requiere contadora):
// No hay cuentas de IVA por pagar/descontable, y ningún flujo de venta
// (`onItemSold`) discrimina IVA hoy. Esto es una omisión deliberada, no una
// verificación: el tratamiento de IVA para compraventas/casas de empeño en
// Colombia depende de variables que no puedo confirmar desde el código —
// si el tenant es responsable de IVA, si aplica el régimen de IVA sobre el
// margen de utilidad para bienes usados (relevante para joyería/oro/celulares
// de segunda mano, análogo al régimen de vehículos usados del Art. 462-1 E.T.
// / Decreto 1794 de 2013), o si aplican exenciones puntuales (ej. oro para
// operaciones específicas bajo Art. 424 E.T., que NO cubre joyería en
// general). Antes de facturar con IVA discriminado hay que confirmar con la
// contadora del negocio bajo qué régimen opera cada tenant y modelar las
// cuentas/cálculo en consecuencia — no asumir un régimen por defecto.
export const CHART_OF_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'Caja', type: AccountType.Asset },
  { code: '1100', name: 'Cartera de préstamos (empeño)', type: AccountType.Asset },
  { code: '1150', name: 'Intereses por cobrar (causados)', type: AccountType.Asset },
  { code: '1200', name: 'Inventario de mercancías', type: AccountType.Asset },
  // Contra-activo: resta contra 1100 en el Balance General para reflejar el
  // valor recuperable estimado de la cartera vencida (NIIF-PYME sección 11,
  // deterioro de instrumentos financieros). Nunca se usa aislada de 1100.
  { code: '1105', name: 'Provisión cartera vencida (contra-cuenta)', type: AccountType.Asset },
  { code: '2000', name: 'Cuentas por pagar (repuestos/proveedores)', type: AccountType.Liability },
  { code: '4000', name: 'Ingresos por venta', type: AccountType.Revenue },
  { code: '4100', name: 'Ingresos financieros (intereses)', type: AccountType.Revenue },
  { code: '5000', name: 'Costo de ventas', type: AccountType.Expense },
  { code: '5100', name: 'Gastos operativos', type: AccountType.Expense },
  { code: '5200', name: 'Gasto por deterioro de cartera', type: AccountType.Expense },
];
