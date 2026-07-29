import { BadRequestException, Injectable } from '@nestjs/common';
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

  async postEntry(tenantId: string, sourceEvent: string, lines: JournalLineInput[]) {
    const totalDebit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `Asiento desbalanceado (${sourceEvent}): débito ${totalDebit} vs crédito ${totalCredit}`,
      );
    }

    const accounts = await this.prisma.account.findMany({
      where: { tenantId, code: { in: lines.map((l) => l.accountCode) } },
    });
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));

    return this.prisma.journalEntry.create({
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

  async incomeStatement(currentUser: AuthenticatedUser, from?: string, to?: string) {
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

    const rows = Array.from(totals.entries()).map(([code, v]) => ({
      code,
      name: v.name,
      type: v.type,
      balance: v.type === 'Revenue' || v.type === 'Liability' || v.type === 'Equity' ? v.credit - v.debit : v.debit - v.credit,
    }));

    const revenue = rows.filter((r) => r.type === 'Revenue').reduce((sum, r) => sum + r.balance, 0);
    const expense = rows.filter((r) => r.type === 'Expense').reduce((sum, r) => sum + r.balance, 0);

    return { rows, revenue, expense, netIncome: revenue - expense };
  }
}
