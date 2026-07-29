import {
  addMonthsUTC,
  advancePaidThrough,
  fractionalMonthsBetween,
  monthlyToEffectiveAnnual,
  quoteInterest,
  quotePartialPayment,
  quoteSettlement,
  roundAmount,
  startedMonthsBetween,
  wholeMonthsBetween,
  InterestPolicy,
} from './interest-calculator';

// Política real del negocio de la Carrera 113: 4% mensual, mes completo,
// redondeo a la centena. Ver docs/11-levantamiento-campo-carrera113.md (RN-01, RN-13).
const POLICY: InterestPolicy = {
  monthlyRate: 0.04,
  accrual: 'FullMonth',
  rounding: 'NearestHundred',
};

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('aritmética de fechas', () => {
  it('suma meses calendario', () => {
    expect(addMonthsUTC(utc('2026-01-15'), 1)).toEqual(utc('2026-02-15'));
    expect(addMonthsUTC(utc('2026-01-15'), 6)).toEqual(utc('2026-07-15'));
  });

  it('recorta al último día del mes cuando el día no existe', () => {
    // Sin el recorte, JS desborda 31-ene + 1 mes a marzo y el cliente
    // terminaría debiendo un mes de más.
    expect(addMonthsUTC(utc('2026-01-31'), 1)).toEqual(utc('2026-02-28'));
    expect(addMonthsUTC(utc('2024-01-31'), 1)).toEqual(utc('2024-02-29')); // bisiesto
    expect(addMonthsUTC(utc('2026-03-31'), 1)).toEqual(utc('2026-04-30'));
  });

  it('cuenta solo meses cumplidos', () => {
    expect(wholeMonthsBetween(utc('2026-01-15'), utc('2026-02-14'))).toBe(0);
    expect(wholeMonthsBetween(utc('2026-01-15'), utc('2026-02-15'))).toBe(1);
    expect(wholeMonthsBetween(utc('2026-01-15'), utc('2026-03-14'))).toBe(1);
    expect(wholeMonthsBetween(utc('2026-01-15'), utc('2026-03-15'))).toBe(2);
  });

  it('no cuenta meses negativos ni hacia atrás', () => {
    expect(wholeMonthsBetween(utc('2026-05-10'), utc('2026-01-10'))).toBe(0);
    expect(wholeMonthsBetween(utc('2026-05-10'), utc('2026-05-10'))).toBe(0);
  });

  it('mide la fracción del mes en curso sobre su duración real', () => {
    // Febrero de 2026 tiene 28 días: 14 días es exactamente medio mes.
    expect(fractionalMonthsBetween(utc('2026-02-01'), utc('2026-02-15'))).toBeCloseTo(0.5, 5);
    expect(fractionalMonthsBetween(utc('2026-01-15'), utc('2026-02-15'))).toBe(1);
  });
});

describe('redondeo', () => {
  it('respeta el modo configurado', () => {
    expect(roundAmount(8040.4, 'None')).toBe(8040.4);
    expect(roundAmount(8040.4, 'NearestPeso')).toBe(8040);
    expect(roundAmount(8040.4, 'NearestHundred')).toBe(8000);
    expect(roundAmount(8060, 'NearestHundred')).toBe(8100);
  });
});

describe('conversión de tasa (CV-015)', () => {
  it('4% mensual equivale a ~60% efectivo anual', () => {
    expect(monthlyToEffectiveAnnual(0.04)).toBeCloseTo(0.6010, 4);
  });

  it('demuestra el bug que corrige: comparada en crudo, 4% parecía menor que el tope anual', () => {
    const maxLegalRateAnual = 0.195;
    expect(0.04 < maxLegalRateAnual).toBe(true); // comparación ingenua: pasa
    expect(monthlyToEffectiveAnnual(0.04) > maxLegalRateAnual).toBe(true); // real: supera el tope
  });
});

describe('quoteInterest — ciclo diario de mostrador', () => {
  const base = {
    principal: 200_000,
    accrualStart: utc('2026-01-15'),
    paidThrough: null,
    policy: POLICY,
  };

  it('un contrato recién desembolsado no debe nada y habilita abono a capital', () => {
    const q = quoteInterest({ ...base, asOf: utc('2026-01-20') });
    expect(q.monthsOwed).toBe(0);
    expect(q.totalOwed).toBe(0);
    expect(q.isCurrent).toBe(true);
  });

  it('al cumplirse el primer mes debe exactamente un mes', () => {
    const q = quoteInterest({ ...base, asOf: utc('2026-02-15') });
    expect(q.monthsOwed).toBe(1);
    expect(q.monthlyAmount).toBe(8000); // 200.000 × 4%
    expect(q.totalOwed).toBe(8000);
    expect(q.isCurrent).toBe(false);
  });

  it('reproduce el caso observado en campo: dos meses adeudados', () => {
    // Escena de la transcripción: "me bota que estoy debiendo dos meses" y
    // pagar uno cuesta $8.000. Ver docs/fuentes/2026-07-transcripcion-carrera113.md
    const q = quoteInterest({ ...base, asOf: utc('2026-03-15') });
    expect(q.monthsOwed).toBe(2);
    expect(q.totalOwed).toBe(16000);
    expect(quotePartialPayment({ ...base, asOf: utc('2026-03-15') }, 1).amount).toBe(8000);
  });

  it('el día anterior al vencimiento del mes todavía no causa el mes', () => {
    const q = quoteInterest({ ...base, asOf: utc('2026-02-14') });
    expect(q.monthsOwed).toBe(0);
    expect(q.totalOwed).toBe(0);
  });

  it('entrega el desglose mes a mes para poder mostrárselo al cliente', () => {
    const q = quoteInterest({ ...base, asOf: utc('2026-03-15') });
    expect(q.breakdown).toHaveLength(2);
    expect(q.breakdown[0]).toEqual({
      from: utc('2026-01-15'),
      to: utc('2026-02-15'),
      amount: 8000,
    });
    expect(q.breakdown[1].to).toEqual(utc('2026-03-15'));
  });

  it('sigue causando interés más allá del plazo de 6 meses (RN-02 vs RN-05)', () => {
    // El negocio deja correr los contratos hasta ~8 meses antes de rematar; el
    // interés no deja de causarse al vencer el plazo.
    const q = quoteInterest({ ...base, asOf: utc('2026-09-15') });
    expect(q.monthsOwed).toBe(8);
    expect(q.totalOwed).toBe(64000);
  });

  it('cobra desde el último mes pagado, no desde el desembolso', () => {
    const q = quoteInterest({
      ...base,
      paidThrough: utc('2026-03-15'),
      asOf: utc('2026-05-15'),
    });
    expect(q.chargingFrom).toEqual(utc('2026-03-15'));
    expect(q.monthsOwed).toBe(2);
  });
});

describe('pago parcial (RN-04)', () => {
  const input = {
    principal: 200_000,
    accrualStart: utc('2026-01-15'),
    paidThrough: null,
    asOf: utc('2026-03-15'),
    policy: POLICY,
  };

  it('pagar 1 de 2 meses deja el contrato aún en mora por el mes restante', () => {
    const { months, amount } = quotePartialPayment(input, 1);
    expect(amount).toBe(8000);

    const nuevoPaidThrough = advancePaidThrough(input.paidThrough ?? input.accrualStart, months);
    expect(nuevoPaidThrough).toEqual(utc('2026-02-15'));

    const despues = quoteInterest({ ...input, paidThrough: nuevoPaidThrough });
    expect(despues.monthsOwed).toBe(1);
    expect(despues.isCurrent).toBe(false); // sigue sin poder abonar a capital (RN-03)
  });

  it('pagar los 2 meses deja el contrato al día y habilita el abono a capital', () => {
    const { months } = quotePartialPayment(input, 2);
    const nuevoPaidThrough = advancePaidThrough(input.accrualStart, months);
    const despues = quoteInterest({ ...input, paidThrough: nuevoPaidThrough });
    expect(despues.monthsOwed).toBe(0);
    expect(despues.totalOwed).toBe(0);
    expect(despues.isCurrent).toBe(true);
  });

  it('rechaza pagar más meses de los adeudados', () => {
    expect(() => quotePartialPayment(input, 3)).toThrow(/solo adeuda 2/);
  });

  it('rechaza montos de meses inválidos', () => {
    expect(() => quotePartialPayment(input, 0)).toThrow(/entero positivo/);
    expect(() => quotePartialPayment(input, 1.5)).toThrow(/entero positivo/);
  });
});

describe('liquidación (RN-01)', () => {
  it('suma capital vigente más intereses causados', () => {
    const { principal, interest, total } = quoteSettlement({
      principal: 200_000,
      accrualStart: utc('2026-01-15'),
      paidThrough: null,
      asOf: utc('2026-03-15'),
      policy: POLICY,
    });
    expect(principal).toBe(200_000);
    expect(interest).toBe(16_000);
    expect(total).toBe(216_000);
  });

  it('un contrato al día se liquida pagando solo el capital', () => {
    const { total } = quoteSettlement({
      principal: 200_000,
      accrualStart: utc('2026-01-15'),
      paidThrough: utc('2026-03-15'),
      asOf: utc('2026-03-20'),
      policy: POLICY,
    });
    expect(total).toBe(200_000);
  });
});

describe('política ProRata (alternativa, RN-13 por confirmar)', () => {
  const proRata: InterestPolicy = { ...POLICY, accrual: 'ProRata', rounding: 'NearestPeso' };

  it('cobra la fracción del mes en curso', () => {
    const q = quoteInterest({
      principal: 200_000,
      accrualStart: utc('2026-02-01'),
      paidThrough: null,
      asOf: utc('2026-02-15'), // medio mes de febrero (28 días)
      policy: proRata,
    });
    expect(q.totalOwed).toBe(4000);
  });

  it('no bloquea el abono a capital por una fracción de mes', () => {
    // Bajo ProRata siempre corre algún interés; si "al día" exigiera saldo cero
    // exacto, ningún cliente podría abonar nunca a capital.
    const q = quoteInterest({
      principal: 200_000,
      accrualStart: utc('2026-02-01'),
      paidThrough: null,
      asOf: utc('2026-02-15'),
      policy: proRata,
    });
    expect(q.totalOwed).toBeGreaterThan(0);
    expect(q.isCurrent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CV-029 — devengo por mes EMPEZADO (RN-16)
// ---------------------------------------------------------------------------
// Estas pruebas no salen de una suposición de diseño: reproducen dos contratos
// reales del sistema legado, leídos de las capturas de la sesión de campo
// (docs/fuentes/2026-07-capturas-plus-cv-carrera113.md, C-02 y C-09). Si alguna
// de las dos falla, el sistema le está cobrando al cliente algo distinto de lo
// que el negocio le cobra hoy en el mostrador.

const POLICY_NEGOCIO: InterestPolicy = {
  monthlyRate: 0.04,
  accrual: 'FullMonthCeil',
  rounding: 'NearestHundred',
};

describe('devengo por mes empezado (RN-16, CV-029)', () => {
  it('cuenta meses empezados, no cumplidos', () => {
    expect(startedMonthsBetween(utc('2026-01-15'), utc('2026-01-15'))).toBe(0);
    expect(startedMonthsBetween(utc('2026-01-15'), utc('2026-01-16'))).toBe(1);
    expect(startedMonthsBetween(utc('2026-01-15'), utc('2026-02-15'))).toBe(1);
    expect(startedMonthsBetween(utc('2026-01-15'), utc('2026-02-16'))).toBe(2);
    expect(startedMonthsBetween(utc('2026-01-15'), utc('2026-03-15'))).toBe(2);
  });

  it('no cuenta hacia atrás', () => {
    expect(startedMonthsBetween(utc('2026-05-10'), utc('2026-01-10'))).toBe(0);
  });

  it('respeta el recorte de fin de mes', () => {
    // 31-ene + 1 mes = 28-feb: ese día el mes está cumplido, no empezado el segundo.
    expect(startedMonthsBetween(utc('2026-01-31'), utc('2026-02-28'))).toBe(1);
    expect(startedMonthsBetween(utc('2026-01-31'), utc('2026-03-01'))).toBe(2);
  });

  // Caso real C-02: contrato 0092541, capital 200.000, última actualización
  // 21/05/2026, fecha de caja 15/07/2026 → el legado muestra "Vencido 1|25" y
  // cobra 16.000 de sobrecosto pendiente (2 meses), con pago total 216.000.
  it('reproduce el contrato 0092541 del legado: 1 mes y 25 días cobra 2 meses', () => {
    const input = {
      principal: 200_000,
      accrualStart: utc('2026-05-21'),
      paidThrough: null,
      asOf: utc('2026-07-15'),
      policy: POLICY_NEGOCIO,
    };
    const q = quoteInterest(input);
    expect(q.monthsOwed).toBe(2);
    expect(q.monthlyAmount).toBe(8000);
    expect(q.totalOwed).toBe(16_000);
    expect(q.isCurrent).toBe(false);
    expect(quoteSettlement(input).total).toBe(216_000);
  });

  // Caso real C-09: contrato 0092520, capital 1.150.000, última actualización
  // 16/05/2026, fecha de caja 15/07/2026 → "Vencido 1|30", sobrecosto 92.000,
  // pago total 1.242.000. Al liquidar, la nueva fecha de corte queda en
  // 16/07/2026, un día DESPUÉS de la fecha de caja (RN-17).
  it('reproduce el contrato 0092520 del legado: 1 mes y 30 días cobra 2 meses', () => {
    const input = {
      principal: 1_150_000,
      accrualStart: utc('2026-05-16'),
      paidThrough: null,
      asOf: utc('2026-07-15'),
      policy: POLICY_NEGOCIO,
    };
    const q = quoteInterest(input);
    expect(q.monthsOwed).toBe(2);
    expect(q.monthlyAmount).toBe(46_000);
    expect(q.totalOwed).toBe(92_000);
    expect(quoteSettlement(input).total).toBe(1_242_000);
    // La fecha de corte avanza 2 meses y queda en el futuro (RN-17).
    expect(advancePaidThrough(utc('2026-05-16'), 2)).toEqual(utc('2026-07-16'));
  });

  it('la política conservadora cobraría la mitad en esos mismos casos', () => {
    // Es el bug que CV-029 corrige: mismo contrato, misma fecha, la mitad de la
    // plata. Se deja como prueba para que nadie devuelva el default sin darse
    // cuenta de lo que significa.
    const conservadora = quoteInterest({
      principal: 1_150_000,
      accrualStart: utc('2026-05-16'),
      paidThrough: null,
      asOf: utc('2026-07-15'),
      policy: { ...POLICY_NEGOCIO, accrual: 'FullMonth' },
    });
    expect(conservadora.totalOwed).toBe(46_000);
  });

  it('un contrato recién desembolsado no debe nada el mismo día', () => {
    const q = quoteInterest({
      principal: 500_000,
      accrualStart: utc('2026-07-15'),
      paidThrough: null,
      asOf: utc('2026-07-15'),
      policy: POLICY_NEGOCIO,
    });
    expect(q.monthsOwed).toBe(0);
    expect(q.totalOwed).toBe(0);
    expect(q.isCurrent).toBe(true);
  });

  it('al día siguiente ya causa un mes completo [pendiente de confirmar con el cliente]', () => {
    // Consecuencia directa de "todo mes empezado". No hay observación de campo
    // de este caso concreto: es la pregunta P-03d de docs/12. Si el negocio
    // responde otra cosa, esta prueba es la que debe cambiar.
    const q = quoteInterest({
      principal: 500_000,
      accrualStart: utc('2026-07-15'),
      paidThrough: null,
      asOf: utc('2026-07-16'),
      policy: POLICY_NEGOCIO,
    });
    expect(q.monthsOwed).toBe(1);
    expect(q.totalOwed).toBe(20_000);
  });

  it('pagar los meses adeudados deja el contrato al día', () => {
    const chargingFrom = utc('2026-05-21');
    const asOf = utc('2026-07-15');
    const input = {
      principal: 200_000,
      accrualStart: chargingFrom,
      paidThrough: null,
      asOf,
      policy: POLICY_NEGOCIO,
    };
    expect(quotePartialPayment(input, 2)).toEqual({ months: 2, amount: 16_000 });
    const despues = quoteInterest({
      ...input,
      paidThrough: advancePaidThrough(chargingFrom, 2),
    });
    expect(despues.monthsOwed).toBe(0);
    expect(despues.isCurrent).toBe(true); // habilita el abono a capital (RN-03)
  });

  it('pagar 1 de 2 meses deja el contrato aún en mora', () => {
    const chargingFrom = utc('2026-05-21');
    const input = {
      principal: 200_000,
      accrualStart: chargingFrom,
      paidThrough: null,
      asOf: utc('2026-07-15'),
      policy: POLICY_NEGOCIO,
    };
    expect(quotePartialPayment(input, 1)).toEqual({ months: 1, amount: 8000 });
    const despues = quoteInterest({
      ...input,
      paidThrough: advancePaidThrough(chargingFrom, 1),
    });
    expect(despues.monthsOwed).toBe(1);
    expect(despues.isCurrent).toBe(false);
  });
});
