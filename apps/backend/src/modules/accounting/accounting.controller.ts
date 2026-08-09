import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ContractStatus, ContractType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { AccountingService } from './accounting.service';
import { AccountingEventsListener } from './accounting-events.listener';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly accountingEventsListener: AccountingEventsListener,
    private readonly prisma: PrismaService,
  ) {}

  @Get('journal-entries')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.findAll(user, from, to);
  }

  @Get('income-statement')
  incomeStatement(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.incomeStatement(user, from, to);
  }

  @Get('balance-sheet')
  balanceSheet(@CurrentUser() user: AuthenticatedUser, @Query('asOf') asOf?: string) {
    return this.accountingService.balanceSheet(user, asOf);
  }

  /**
   * Causación de intereses "de cierre de mes" a demanda: recorre todos los
   * contratos de empeño vigentes (Active/Overdue) del tenant y causa el
   * interés devengado y no reconocido de cada uno. El proyecto no tiene
   * infraestructura de cron/scheduler todavía, así que esto se corre a mano.
   * Secuencial a propósito, para no saturar la conexión a la base de datos.
   */
  @Post('accrue-interest')
  async accrueInterest(@CurrentUser() user: AuthenticatedUser) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId: user.tenantId,
        contractType: ContractType.Pawn,
        status: { in: [ContractStatus.Active, ContractStatus.Overdue] },
      },
      select: { id: true },
    });

    let accruedCount = 0;
    let totalAccrued = 0;
    for (const contract of contracts) {
      const amount = await this.accountingEventsListener.accrueInterest(contract.id);
      if (amount) {
        accruedCount += 1;
        totalAccrued += amount;
      }
    }

    return { contractsChecked: contracts.length, contractsAccrued: accruedCount, totalAccrued };
  }
}
