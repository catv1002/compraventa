/**
 * Motor de liquidación de intereses (CV-002).
 *
 * Por qué existe: en el sistema legado —y en el scaffold anterior de este
 * repo— el monto de intereses lo digitaba el operador. Eso significa que "cuánto
 * debe el cliente" no era una respuesta del sistema sino una cuenta de cabeza,
 * y de ahí salen los descuadres de caja que el negocio busca contrato por
 * contrato al mediodía. Ver docs/11-levantamiento-campo-carrera113.md §3.2.
 *
 * Este módulo es **puro a propósito**: no importa Prisma, no toca la base de
 * datos y no conoce NestJS. Toda la aritmética de dinero del negocio vive aquí
 * para poder probarse exhaustivamente sin infraestructura (CV-014).
 *
 * Modelo mental: un contrato de empeño causa un interés fijo por cada mes
 * cumplido sobre el capital vigente. `interestPaidThrough` es la frontera entre
 * lo pagado y lo adeudado; cada mes que el cliente paga la adelanta un mes
 * calendario. Esto reproduce exactamente lo observado en campo — "debo dos
 * meses, pago uno y quedo debiendo uno" (RN-04) — y hace que "estar al día"
 * (RN-03) sea una comparación de fechas y no una acumulación de saldos
 * susceptible de arrastrar centavos.
 */

/**
 * Cómo se causa el interés. Ver `InterestAccrualPolicy` en schema.prisma.
 *
 * - `FullMonthCeil` — **la del negocio real**: se cobra todo mes EMPEZADO. Con
 *   1 mes y 25 días de mora se cobran 2 meses. Verificado contra dos contratos
 *   del sistema legado, ver `docs/11` RN-16 y `docs/12` CV-029.
 * - `FullMonth` — se cobra solo el mes CUMPLIDO. Con 1 mes y 25 días se cobra 1.
 *   Es la política conservadora: cobra menos, nunca de más.
 * - `ProRata` — proporcional a los días transcurridos.
 *
 * La diferencia entre las dos primeras no es un detalle: sobre los casos reales
 * observados, `FullMonth` cotiza exactamente la mitad de lo que cobra el negocio.
 */
export type AccrualPolicy = 'FullMonthCeil' | 'FullMonth' | 'ProRata';

/** Redondeo del importe final. En pesos colombianos el negocio cobra cifras
 * redondas; `NearestHundred` es el default configurado. */
export type RoundingMode = 'None' | 'NearestPeso' | 'NearestHundred';

export interface InterestPolicy {
  /** Tasa MENSUAL en tanto por uno. 0.04 = 4% mensual (RN-01). */
  monthlyRate: number;
  accrual: AccrualPolicy;
  rounding: RoundingMode;
}

export interface InterestQuoteInput {
  /** Capital vigente sobre el que se calcula el interés. */
  principal: number;
  /** Inicio del devengo: la fecha de desembolso, no la de creación del contrato. */
  accrualStart: Date;
  /** Hasta dónde están pagados los intereses. Si es null, nunca ha pagado y se
   * cuenta desde `accrualStart`. */
  paidThrough: Date | null;
  asOf: Date;
  policy: InterestPolicy;
}

/** Un mes causado, para poder mostrarle al cliente el desglose de lo que debe. */
export interface InterestPeriod {
  from: Date;
  to: Date;
  amount: number;
}

export interface InterestQuote {
  asOf: Date;
  /** Desde cuándo se está cobrando: `paidThrough ?? accrualStart`. */
  chargingFrom: Date;
  /** Importe de un mes completo, ya redondeado. */
  monthlyAmount: number;
  /** Meses completos vencidos y no pagados. */
  monthsOwed: number;
  /** Total a pagar hoy para quedar al día. */
  totalOwed: number;
  /** True si no debe nada. Es la condición que habilita el abono a capital (RN-03). */
  isCurrent: boolean;
  /** Cuándo se causa el próximo mes (útil para avisar al cliente, D-03). */
  nextAccrualDate: Date;
  breakdown: InterestPeriod[];
}

// ---------------------------------------------------------------------------
// Aritmética de fechas (UTC)
// ---------------------------------------------------------------------------
// Todo se hace en UTC porque Prisma persiste DateTime en UTC. Hacerlo en hora
// local haría que el mismo contrato debiera distinto según la zona horaria del
// servidor, que es exactamente el tipo de error que nadie detecta hasta que un
// cliente reclama.

/**
 * Suma meses calendario en UTC, recortando el día al último día del mes destino
 * cuando no existe: 31-ene + 1 mes = 28-feb (o 29 en bisiesto). Sin este recorte
 * JavaScript desborda a marzo y el cliente terminaría debiendo un mes de más.
 */
export function addMonthsUTC(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const result = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

/**
 * Meses calendario COMPLETOS transcurridos entre dos fechas. Un mes solo cuenta
 * cuando se cumple: del 15-ene al 14-feb son 0 meses; al 15-feb es 1.
 */
export function wholeMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) {
    return 0;
  }
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  // El cálculo por componentes se pasa por uno cuando el día del mes destino
  // aún no alcanza al de origen (p. ej. 31-ene → 15-feb da 1, pero es 0).
  if (addMonthsUTC(from, months).getTime() > to.getTime()) {
    months -= 1;
  }
  return Math.max(0, months);
}

/**
 * Meses EMPEZADOS entre dos fechas: cualquier fracción de mes cuenta como mes
 * entero. Del 15-ene al 15-feb es 1; al 16-feb ya son 2.
 *
 * Es el conteo que usa el sistema legado y por tanto el que reproduce las cifras
 * que el negocio le cobra al cliente (RN-16). Contrastar con
 * `wholeMonthsBetween()`, que cuenta lo contrario.
 *
 * Consecuencia deliberada en el borde: un contrato desembolsado hace un solo día
 * ya causa un mes completo. No hay observación de campo de ese caso concreto
 * —los dos contratos capturados llevaban mes y medio largo—, así que está
 * pendiente de confirmar con el cliente (P-03d en docs/12). Si resultara falso,
 * el cambio es aquí y solo aquí.
 */
export function startedMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) {
    return 0;
  }
  const whole = wholeMonthsBetween(from, to);
  // Si `to` cae exactamente en el aniversario mensual, el mes está cumplido y no
  // hay uno nuevo empezado.
  return addMonthsUTC(from, whole).getTime() === to.getTime() ? whole : whole + 1;
}

/**
 * Meses transcurridos con parte fraccionaria, para la política ProRata. La
 * fracción se mide sobre la duración real del mes en curso, no sobre 30 días
 * fijos, para que dos meses consecutivos no cobren distinto por el mismo día.
 */
export function fractionalMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) {
    return 0;
  }
  const whole = wholeMonthsBetween(from, to);
  const periodStart = addMonthsUTC(from, whole);
  const periodEnd = addMonthsUTC(from, whole + 1);
  const spanMs = periodEnd.getTime() - periodStart.getTime();
  const elapsedMs = to.getTime() - periodStart.getTime();
  return whole + (spanMs > 0 ? elapsedMs / spanMs : 0);
}

// ---------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------

export function roundAmount(amount: number, mode: RoundingMode): number {
  switch (mode) {
    case 'None':
      return amount;
    case 'NearestPeso':
      return Math.round(amount);
    case 'NearestHundred':
      return Math.round(amount / 100) * 100;
  }
}

/**
 * Convierte una tasa mensual a su equivalente EFECTIVA ANUAL (CV-015).
 *
 * Existe porque `TenantConfiguration.maxLegalRate` está expresada en tasa
 * efectiva anual —la base en que la Superintendencia Financiera certifica el
 * interés bancario corriente— mientras que la tasa de un contrato es mensual.
 * Compararlas directamente, como hacía el scaffold, dejaba pasar un 4% mensual
 * (≈60% E.A.) contra un tope de 19.5% creyendo que 0.04 < 0.195.
 */
export function monthlyToEffectiveAnnual(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

// ---------------------------------------------------------------------------
// Cotización
// ---------------------------------------------------------------------------

/**
 * Responde "cuánto debe este contrato hoy" sin que nadie digite un monto.
 *
 * Nota sobre RN-13/RN-16: el sentido del redondeo del mes salió de las capturas
 * del sistema legado (`docs/fuentes/2026-07-capturas-plus-cv-carrera113.md`), no
 * de una respuesta del cliente. Sigue siendo un parámetro (`policy.accrual`) y
 * no una constante: si el negocio matiza la regla, se cambia la configuración,
 * no el código.
 */
export function quoteInterest(input: InterestQuoteInput): InterestQuote {
  const { principal, accrualStart, paidThrough, asOf, policy } = input;
  const chargingFrom = paidThrough ?? accrualStart;

  const rawMonthly = principal * policy.monthlyRate;
  const monthlyAmount = roundAmount(rawMonthly, policy.rounding);

  // Los meses que se cobran dependen de la política: el negocio cobra todo mes
  // empezado, no todo mes cumplido.
  const monthsOwed =
    policy.accrual === 'FullMonthCeil'
      ? startedMonthsBetween(chargingFrom, asOf)
      : wholeMonthsBetween(chargingFrom, asOf);

  const breakdown: InterestPeriod[] = [];
  for (let i = 0; i < monthsOwed; i += 1) {
    breakdown.push({
      from: addMonthsUTC(chargingFrom, i),
      to: addMonthsUTC(chargingFrom, i + 1),
      amount: monthlyAmount,
    });
  }

  let totalOwed: number;
  if (policy.accrual === 'FullMonthCeil' || policy.accrual === 'FullMonth') {
    totalOwed = monthlyAmount * monthsOwed;
  } else {
    const exactMonths = fractionalMonthsBetween(chargingFrom, asOf);
    totalOwed = roundAmount(rawMonthly * exactMonths, policy.rounding);
  }

  return {
    asOf,
    chargingFrom,
    monthlyAmount,
    monthsOwed,
    totalOwed,
    // Bajo ProRata el interés corre todos los días, así que "al día" solo puede
    // significar que no hay ningún mes cumplido pendiente; de lo contrario
    // ningún cliente podría abonar a capital jamás.
    isCurrent: monthsOwed === 0,
    // Bajo `FullMonthCeil` los meses cobrados ya incluyen el mes en curso, así
    // que el siguiente empieza a causarse justo al cerrar el último cobrado; con
    // las otras políticas hay que esperar a que ese mes se cumpla.
    nextAccrualDate: addMonthsUTC(
      chargingFrom,
      policy.accrual === 'FullMonthCeil' ? monthsOwed : monthsOwed + 1,
    ),
    breakdown,
  };
}

/**
 * Importe exacto de pagar `months` meses de interés — el operador elige cuántos
 * meses paga, no cuánta plata entrega (RN-04).
 */
export function quotePartialPayment(
  input: InterestQuoteInput,
  months: number,
): { months: number; amount: number } {
  const quote = quoteInterest(input);
  if (!Number.isInteger(months) || months < 1) {
    throw new Error('El número de meses a pagar debe ser un entero positivo');
  }
  if (months > quote.monthsOwed) {
    throw new Error(
      `No se pueden pagar ${months} meses: el contrato solo adeuda ${quote.monthsOwed}`,
    );
  }
  return { months, amount: quote.monthlyAmount * months };
}

/** Nueva frontera de intereses pagados tras abonar `months` meses. */
export function advancePaidThrough(chargingFrom: Date, months: number): Date {
  return addMonthsUTC(chargingFrom, months);
}

/**
 * Total para retirar la joya: capital vigente + intereses causados (RN-01).
 * Es lo que el sistema legado muestra en la pantalla de liquidación.
 */
export function quoteSettlement(input: InterestQuoteInput): {
  principal: number;
  interest: number;
  total: number;
  quote: InterestQuote;
} {
  const quote = quoteInterest(input);
  return {
    principal: input.principal,
    interest: quote.totalOwed,
    total: input.principal + quote.totalOwed,
    quote,
  };
}
