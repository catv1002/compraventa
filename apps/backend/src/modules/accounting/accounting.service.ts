import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  branchId?: string;
}

// Todo asiento debe cuadrar débito=crédito — ver docs/03-dominios-ddd.md (7. Contabilidad).
@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // `tx` permite postear dentro de una transacción de negocio ya abierta —
  // mismo patrón que `CashService.recordMovement`. Necesario para que el
  // asiento y el `contract.update` que avanza el marcador de causación
  // (`interestAccruedThrough`/`provisionedAmount`) se confirmen o reviertan
  // juntos: sin esto, un crash entre ambas escrituras deja el asiento
  // posteado pero el marcador sin avanzar, y la próxima corrida del cron
  // vuelve a causar/provisionar el mismo período, duplicando el asiento.
  async postEntry(
    tenantId: string,
    sourceEvent: string,
    lines: JournalLineInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    const totalDebit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `Asiento desbalanceado (${sourceEvent}): débito ${totalDebit} vs crédito ${totalCredit}`,
      );
    }

    const accounts = await db.account.findMany({
      where: { tenantId, code: { in: lines.map((l) => l.accountCode) } },
    });
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));

    // Falla explícita, no un TypeError silencioso: `CHART_OF_ACCOUNTS` solo
    // se siembra vía `prisma/seed.ts` para el tenant que se está
    // provisionando — si se agrega una cuenta nueva (ej. 1105/5200 en Fase 7)
    // y un tenant existente no vuelve a correr el seed, cada intento de
    // postear a esa cuenta reventaba con `Cannot read properties of
    // undefined` dentro de un cron nocturno que solo lo loguea y sigue,
    // dejando el asiento sin contabilizar sin que nadie se entere.
    const missing = lines.map((l) => l.accountCode).filter((code) => !accountByCode.has(code));
    if (missing.length > 0) {
      throw new BadRequestException(
        `No se puede postear el asiento (${sourceEvent}): faltan las cuentas ${missing.join(', ')} ` +
          `en el plan de cuentas del tenant ${tenantId}. Corra el seed de cuentas para este tenant.`,
      );
    }

    return db.journalEntry.create({
      data: {
        tenantId,
        sourceEvent,
        lines: {
          create: lines.map((l) => ({
            accountId: accountByCode.get(l.accountCode)!.id,
            branchId: l.branchId,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  findAll(currentUser: AuthenticatedUser, from?: string, to?: string) {
    return this.prisma.journalEntry.findMany({
      where: {
        tenantId: currentUser.tenantId,
        entryDate: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { lines: { include: { account: true } } },
      orderBy: { entryDate: 'desc' },
    });
  }

  /**
   * Saldo por cuenta en el rango pedido. Débito natural (Asset/Expense) resta
   * crédito; crédito natural (Revenue/Liability/Equity) resta débito — la
   * misma convención en todas partes de este servicio, no una por reporte.
   */
  private async accountBalances(currentUser: AuthenticatedUser, from?: string, to?: string) {
    const entries = await this.findAll(currentUser, from, to);
    const totals = new Map<string, { name: string; type: string; debit: number; credit: number }>();

    for (const entry of entries) {
      for (const line of entry.lines) {
        const key = line.account.code;
        const current = totals.get(key) ?? { name: line.account.name, type: line.account.type, debit: 0, credit: 0 };
        current.debit += Number(line.debit);
        current.credit += Number(line.credit);
        totals.set(key, current);
      }
    }

    return Array.from(totals.entries()).map(([code, v]) => ({
      code,
      name: v.name,
      type: v.type,
      balance: v.type === 'Revenue' || v.type === 'Liability' || v.type === 'Equity' ? v.credit - v.debit : v.debit - v.credit,
    }));
  }

  async incomeStatement(currentUser: AuthenticatedUser, from?: string, to?: string) {
    const rows = await this.accountBalances(currentUser, from, to);
    const revenue = rows.filter((r) => r.type === 'Revenue').reduce((sum, r) => sum + r.balance, 0);
    const expense = rows.filter((r) => r.type === 'Expense').reduce((sum, r) => sum + r.balance, 0);

    return { rows, revenue, expense, netIncome: revenue - expense };
  }

  /**
   * Balance General a una fecha de corte: acumulado DESDE EL INICIO (nunca se
   * le pasa `from`, a diferencia del Estado de Resultados que sí es por
   * período) — un activo no "empieza en cero" cada mes.
   *
   * Este sistema no tiene proceso de cierre contable (no hay asiento que
   * traslade el resultado del ejercicio a una cuenta de patrimonio) — ver
   * hallazgo de la auditoría contable. Mientras eso no exista, el resultado
   * acumulado (ingresos - gastos a la fecha) se muestra como una línea aparte
   * dentro de patrimonio ("Resultado del ejercicio, no cerrado") para que el
   * Balance cuadre igual (Activo = Pasivo + Patrimonio) sin fingir que ya se
   * cerró el período.
   */
  async balanceSheet(currentUser: AuthenticatedUser, asOf?: string) {
    const rows = await this.accountBalances(currentUser, undefined, asOf);

    const activos = rows.filter((r) => r.type === 'Asset');
    const pasivos = rows.filter((r) => r.type === 'Liability');
    const patrimonio = rows.filter((r) => r.type === 'Equity');
    const revenue = rows.filter((r) => r.type === 'Revenue').reduce((sum, r) => sum + r.balance, 0);
    const expense = rows.filter((r) => r.type === 'Expense').reduce((sum, r) => sum + r.balance, 0);
    const resultadoDelEjercicio = revenue - expense;

    const totalActivos = activos.reduce((sum, r) => sum + r.balance, 0);
    const totalPasivos = pasivos.reduce((sum, r) => sum + r.balance, 0);
    const totalPatrimonio = patrimonio.reduce((sum, r) => sum + r.balance, 0) + resultadoDelEjercicio;

    return {
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      activos,
      pasivos,
      patrimonio,
      resultadoDelEjercicio,
      totalActivos,
      totalPasivos,
      totalPatrimonio,
      cuadra: Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 0.01,
    };
  }
}
