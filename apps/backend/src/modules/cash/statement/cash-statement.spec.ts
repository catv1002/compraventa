import {
  buildCashStatement,
  sortLedgerEntries,
  CashLedgerEntry,
} from './cash-statement';
import {
  disbursementDetail,
  fallbackDetail,
  principalPaymentDetail,
  renewalSurchargeDetail,
  settlementPrincipalDetail,
  settlementSurchargeDetail,
} from './cash-movement-detail';

const at = (iso: string) => new Date(`2026-07-15T${iso}:00.000Z`);

let nextSeq = 1;

function entry(
  time: string,
  type: 'CashIn' | 'CashOut',
  amount: number,
  detail: string,
  documentNumber: string | null = null,
  seq?: number,
): CashLedgerEntry {
  return {
    id: `mov-${detail}-${time}-${amount}`,
    seq: seq ?? nextSeq++,
    documentNumber,
    detail,
    type,
    amount,
    createdAt: at(time),
    contractId: documentNumber ? `contract-${documentNumber}` : null,
  };
}

beforeEach(() => {
  nextSeq = 1;
});

describe('saldo corrido', () => {
  it('arranca en el saldo inicial y no lo altera si no hay movimientos', () => {
    const statement = buildCashStatement(11_417_260, []);
    expect(statement.saldoInicial).toBe(11_417_260);
    expect(statement.saldoFinal).toBe(11_417_260);
    expect(statement.filas).toHaveLength(0);
    expect(statement.totalDebitos).toBe(0);
    expect(statement.totalCreditos).toBe(0);
  });

  it('el débito suma y el crédito resta (RN-24)', () => {
    // La convención no es interpretable: débito = entra efectivo (el cliente
    // paga), crédito = sale (se desembolsa el contrato).
    const statement = buildCashStatement(1_000_000, [
      entry('10:00', 'CashIn', 200_000, 'ENTRA'),
      entry('10:05', 'CashOut', 500_000, 'SALE'),
    ]);

    expect(statement.filas[0]).toMatchObject({ debito: 200_000, credito: 0, saldo: 1_200_000 });
    expect(statement.filas[1]).toMatchObject({ debito: 0, credito: 500_000, saldo: 700_000 });
    expect(statement.saldoFinal).toBe(700_000);
  });

  it('reproduce el extracto real del legado fila por fila (C-07, 15/07/2026)', () => {
    // Caso de referencia: las 16 filas capturadas del sistema legado, que
    // encadenan sin un solo descuadre de 11:50 a 17:33 y cierran en 10.471.260.
    // Si esta prueba falla, o cambió la convención de signos o cambió la forma
    // de arrastrar el saldo — y en ambos casos el informe del negocio deja de
    // cuadrar con el que la dueña conoce.
    //
    // El saldo inicial se deduce de la primera fila: 11.417.260 - 2.000.000.
    const saldoInicial = 9_417_260;

    const statement = buildCashStatement(saldoInicial, [
      entry('11:50', 'CashIn', 2_000_000, settlementPrincipalDetail(89871), '89871'),
      entry('12:24', 'CashIn', 8_000, renewalSurchargeDetail(92657), '92657'),
      entry('14:07', 'CashIn', 36_000, renewalSurchargeDetail(91810), '91810'),
      entry('14:28', 'CashOut', 250_000, disbursementDetail(92748), '92748'),
      entry('14:34', 'CashOut', 500_000, disbursementDetail(92749), '92749'),
      entry('14:59', 'CashIn', 12_000, renewalSurchargeDetail(90954), '90954'),
      entry('15:25', 'CashOut', 1_000_000, disbursementDetail(92750), '92750'),
      entry('15:29', 'CashIn', 16_000, renewalSurchargeDetail(92659), '92659'),
      entry('15:29', 'CashIn', 100_000, principalPaymentDetail(92659), '92659'),
      entry('15:49', 'CashOut', 1_500_000, disbursementDetail(92751), '92751'),
      entry('16:11', 'CashIn', 72_000, settlementSurchargeDetail(92627), '92627'),
      entry('16:11', 'CashIn', 1_800_000, settlementPrincipalDetail(92627), '92627'),
      entry('16:50', 'CashIn', 4_000, renewalSurchargeDetail(82555), '82555'),
      entry('16:50', 'CashIn', 8_800, renewalSurchargeDetail(83983), '83983'),
      entry('16:53', 'CashIn', 7_200, renewalSurchargeDetail(82938), '82938'),
      entry('17:33', 'CashIn', 240_000, renewalSurchargeDetail(90092), '90092'),
    ]);

    expect(statement.filas.map((fila) => fila.saldo)).toEqual([
      11_417_260, 11_425_260, 11_461_260, 11_211_260, 10_711_260, 10_723_260, 9_723_260,
      9_739_260, 9_839_260, 8_339_260, 8_411_260, 10_211_260, 10_215_260, 10_224_060,
      10_231_260, 10_471_260,
    ]);
    expect(statement.saldoFinal).toBe(10_471_260);

    // El saldo final tiene que ser reconstruible desde los totales, o el
    // resumen del informe diario no sumaría su propio detalle.
    expect(statement.totalDebitos).toBe(4_304_000);
    expect(statement.totalCreditos).toBe(3_250_000);
    expect(saldoInicial + statement.totalDebitos - statement.totalCreditos).toBe(
      statement.saldoFinal,
    );
  });

  it('no arrastra centavos al encadenar importes con decimales', () => {
    // Punto flotante crudo daría 0.30000000000000004 y un arqueo descuadrado
    // por centavos se investiga igual que uno descuadrado por millones.
    const statement = buildCashStatement(0, [
      entry('10:00', 'CashIn', 0.1, 'A'),
      entry('10:01', 'CashIn', 0.2, 'B'),
    ]);
    expect(statement.saldoFinal).toBe(0.3);
  });

  it('admite que el saldo quede en negativo en vez de recortarlo', () => {
    // Si el libro dice que salió más plata de la que había, el extracto tiene
    // que mostrarlo: es exactamente la señal que hay que investigar.
    const statement = buildCashStatement(100_000, [entry('10:00', 'CashOut', 250_000, 'SALE')]);
    expect(statement.saldoFinal).toBe(-150_000);
  });
});

describe('orden de los asientos', () => {
  it('ordena cronológicamente aunque lleguen desordenados', () => {
    const ordered = sortLedgerEntries([
      entry('17:33', 'CashIn', 240_000, 'TARDE', null, 3),
      entry('11:50', 'CashIn', 2_000_000, 'TEMPRANO', null, 1),
      entry('14:28', 'CashOut', 250_000, 'MEDIODIA', null, 2),
    ]);
    expect(ordered.map((e) => e.detail)).toEqual(['TEMPRANO', 'MEDIODIA', 'TARDE']);
  });

  it('desempata por seq dos asientos del mismo instante', () => {
    // Es el caso de la liquidación: capital y retroventa se escriben en la
    // misma transacción y pueden compartir timestamp al milisegundo. Sin el
    // desempate, el saldo corrido de esas dos filas cambiaría entre consultas.
    const capital = entry('16:11', 'CashIn', 1_800_000, settlementPrincipalDetail(92627), '92627', 2);
    const retroventa = entry('16:11', 'CashIn', 72_000, settlementSurchargeDetail(92627), '92627', 1);

    const statement = buildCashStatement(8_339_260, [capital, retroventa]);

    expect(statement.filas.map((fila) => fila.detalle)).toEqual([
      'RETROVENTA PAGADO POR LIQUIDACION DEL CONTRATO # 92627',
      'CAPITAL LIQUIDACION DEL CONTRATO # 92627',
    ]);
    expect(statement.filas.map((fila) => fila.saldo)).toEqual([8_411_260, 10_211_260]);
  });
});

describe('la fila del extracto', () => {
  it('conserva documento, detalle y hora de proceso', () => {
    const statement = buildCashStatement(0, [
      entry('16:11', 'CashIn', 1_800_000, settlementPrincipalDetail(92627), '92627'),
    ]);
    expect(statement.filas[0]).toMatchObject({
      documento: '92627',
      detalle: 'CAPITAL LIQUIDACION DEL CONTRATO # 92627',
      fechaProceso: at('16:11'),
      contractId: 'contract-92627',
    });
  });
});

describe('terminología legal del libro (RN-25)', () => {
  it('usa los textos del legado y no el idioma del mostrador', () => {
    // El mostrador dice "intereses", "abono", "liquidar". El libro y el
    // contrato impreso dicen "recompra", "retroventa", "capital liquidación":
    // bajo sustancia sobre forma, documentar la operación como un préstamo con
    // intereses es lo que permite recalificarla como mutuo con prenda.
    expect(settlementPrincipalDetail(92627)).toBe('CAPITAL LIQUIDACION DEL CONTRATO # 92627');
    expect(settlementSurchargeDetail(92627)).toBe(
      'RETROVENTA PAGADO POR LIQUIDACION DEL CONTRATO # 92627',
    );
    expect(renewalSurchargeDetail(92657)).toBe(
      'RECOMPRA PAGADO POR ACTUALIZACION DEL CONTRATO # 92657',
    );
    expect(principalPaymentDetail(92659)).toBe('ABONO A CAPITAL DEL CONTRATO # 92659');
    expect(disbursementDetail(92748)).toBe('CONTRATO # 92748');

    const legales = [
      settlementPrincipalDetail(1),
      settlementSurchargeDetail(1),
      renewalSurchargeDetail(1),
      principalPaymentDetail(1),
    ];
    for (const texto of legales) {
      expect(texto).not.toMatch(/INTERES|PRESTAMO|EMPEÑO/i);
    }
  });

  it('el detalle de último recurso no inventa terminología legal', () => {
    expect(fallbackDetail('Contract', '92627')).toBe('MOVIMIENTO CONTRACT # 92627');
    expect(fallbackDetail('ManualIncome')).toBe('MOVIMIENTO MANUALINCOME');
    expect(fallbackDetail('Contract', '92627')).not.toMatch(/RETROVENTA|RECOMPRA|CAPITAL/);
  });
});
