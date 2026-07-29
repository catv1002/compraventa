/**
 * Extracto de caja con saldo corrido (CV-032).
 *
 * Por qué existe: el descuadre de caja se busca "contrato por contrato"
 * (docs/11-levantamiento-campo-carrera113.md §3.2). Lo que hace posible esa
 * búsqueda es el saldo corrido: recorriendo las filas hacia atrás se ve
 * exactamente en cuál dejó de cuadrar. Sin esa columna el extracto es una lista
 * de importes y hay que sumar a mano.
 *
 * Este módulo es **puro a propósito**, igual que
 * `contracts/interest/interest-calculator.ts`: no importa Prisma, no toca la
 * base de datos y no conoce NestJS. El saldo corrido es aritmética de dinero,
 * así que se prueba exhaustivamente sin infraestructura (CV-014).
 *
 * El saldo se calcula SIEMPRE en el servidor. Que lo acumule el cliente
 * significaría que dos pantallas distintas pueden mostrar dos saldos distintos
 * para el mismo día, y que el número que el negocio usa para cuadrar la caja
 * depende de qué navegador lo abrió.
 */

/**
 * Convención de signos (RN-24), verificada contra el legado: las 16 filas de
 * C-07 encadenan sin un solo descuadre con **débito sumando y crédito
 * restando**.
 *
 * - `CashIn`  → DÉBITO: entra efectivo (liquidación, recompra, abono a capital).
 * - `CashOut` → CRÉDITO: sale efectivo (desembolso al abrir un contrato).
 *
 * El signo no viaja nunca en el importe: `amount` es siempre positivo y la
 * dirección la lleva `type`. Un extracto que invierta esto está mal.
 */
export type CashEntryDirection = 'CashIn' | 'CashOut';

/** Un asiento tal como está guardado, sin saldo: el saldo es derivado. */
export interface CashLedgerEntry {
  id: string;
  /** Orden de asiento; desempata dos movimientos con el mismo `createdAt`. */
  seq: number;
  /** Columna "Documento": el consecutivo de negocio del contrato, si lo hay. */
  documentNumber: string | null;
  /** Columna "Detalle", con la terminología legal del libro (RN-25). */
  detail: string;
  type: CashEntryDirection;
  /** Importe positivo. La dirección la da `type`, no el signo. */
  amount: number;
  /** Momento del asiento — es a la vez "Fecha" y "Fecha Proceso" (con hora). */
  createdAt: Date;
  /** Enlace al contrato de origen, para que cada cifra sea trazable (CV-019). */
  contractId: string | null;
}

/** Una fila del extracto, ya con el saldo resuelto. */
export interface CashStatementRow {
  id: string;
  documento: string | null;
  /** Día contable del asiento. */
  fecha: Date;
  detalle: string;
  /** Entrada de efectivo. Cero cuando la fila es un crédito. */
  debito: number;
  /** Salida de efectivo. Cero cuando la fila es un débito. */
  credito: number;
  /** Saldo de caja DESPUÉS de aplicar esta fila. */
  saldo: number;
  /** Momento exacto del proceso, con hora — la columna "Fecha Proceso". */
  fechaProceso: Date;
  contractId: string | null;
}

export interface CashStatement {
  /** Saldo de arranque sobre el que se encadena la primera fila. */
  saldoInicial: number;
  filas: CashStatementRow[];
  totalDebitos: number;
  totalCreditos: number;
  /** `saldoInicial + totalDebitos - totalCreditos`, y también el saldo de la última fila. */
  saldoFinal: number;
}

/**
 * Redondeo a dos decimales en cada paso de la cadena.
 *
 * No es cosmético: acumular en punto flotante sin normalizar hace que el saldo
 * final se separe unos centavos del importe que la cajera tiene en la mano, y
 * un arqueo que difiere en centavos se investiga igual que uno que difiere en
 * millones. Los importes viven en `Decimal(14,2)`, así que dos decimales es la
 * precisión real del dato, no una aproximación.
 */
function round2(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Orden cronológico estable: primero por momento del asiento, y a igualdad de
 * momento por `seq`.
 *
 * El desempate no es defensivo por si acaso: capital y retroventa de una misma
 * liquidación se escriben en la misma transacción (RN-26) y pueden compartir
 * timestamp al milisegundo. Sin `seq`, el orden lo decidiría la base de datos y
 * el saldo corrido de esas dos filas cambiaría entre consultas.
 */
export function sortLedgerEntries(entries: CashLedgerEntry[]): CashLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    return byTime !== 0 ? byTime : a.seq - b.seq;
  });
}

/**
 * Encadena el saldo corrido sobre una secuencia de asientos.
 *
 * `saldoInicial` es el saldo con el que arranca el rango consultado — la base de
 * la caja, que por RN-09 es el saldo de cierre del día anterior porque al cerrar
 * NO se retira el efectivo. Quien lo obtiene de la base de datos es
 * `CashService.getStatement()`; aquí solo se arrastra.
 */
export function buildCashStatement(
  saldoInicial: number,
  entries: CashLedgerEntry[],
): CashStatement {
  let saldo = round2(saldoInicial);
  let totalDebitos = 0;
  let totalCreditos = 0;

  const filas = sortLedgerEntries(entries).map((entry): CashStatementRow => {
    const debito = entry.type === 'CashIn' ? round2(entry.amount) : 0;
    const credito = entry.type === 'CashOut' ? round2(entry.amount) : 0;

    totalDebitos = round2(totalDebitos + debito);
    totalCreditos = round2(totalCreditos + credito);
    saldo = round2(saldo + debito - credito);

    return {
      id: entry.id,
      documento: entry.documentNumber,
      fecha: entry.createdAt,
      detalle: entry.detail,
      debito,
      credito,
      saldo,
      fechaProceso: entry.createdAt,
      contractId: entry.contractId,
    };
  });

  return {
    saldoInicial: round2(saldoInicial),
    filas,
    totalDebitos,
    totalCreditos,
    saldoFinal: saldo,
  };
}
