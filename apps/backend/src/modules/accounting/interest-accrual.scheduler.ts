import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContractStatus, ContractType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingEventsListener } from './accounting-events.listener';

// Reemplaza el disparo manual de POST /accounting/accrue-interest (que sigue
// existiendo para causar "a demanda", ej. antes de un cierre puntual) por un
// job diario: sin esto, un tenant que nunca abre esa pantalla nunca reconoce
// el interés devengado en el periodo, y el Estado de Resultados/Balance
// General de un mes en curso queda subestimado hasta que se cobra o liquida.
//
// Corre sobre TODOS los tenants (no hay `currentUser` en un cron), uno tras
// otro y secuencial dentro de cada uno, mismo criterio que el endpoint
// manual: no saturar la conexión a la base de datos.
@Injectable()
export class InterestAccrualScheduler {
  private readonly logger = new Logger(InterestAccrualScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingEventsListener: AccountingEventsListener,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async accrueAllTenants() {
    const contracts = await this.prisma.contract.findMany({
      where: {
        contractType: ContractType.Pawn,
        status: { in: [ContractStatus.Active, ContractStatus.Overdue] },
      },
      select: { id: true },
    });

    let accruedCount = 0;
    for (const contract of contracts) {
      try {
        const amount = await this.accountingEventsListener.accrueInterest(contract.id);
        if (amount) accruedCount += 1;
      } catch (error) {
        // Un contrato con datos inconsistentes no debe tumbar la causación del
        // resto — se registra y se sigue.
        this.logger.error(`Fallo causando interés del contrato ${contract.id}`, error as Error);
      }
    }

    this.logger.log(`Causación diaria: ${accruedCount}/${contracts.length} contratos causados`);
  }

  // Mismo job, corrido después: la provisión de cartera se calcula sobre el
  // capital vigente, que la causación de arriba no toca, pero conviene que
  // ambos jobs de cierre nocturno corran juntos en vez de en horarios sueltos.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async provisionOverdueAllTenants() {
    const contracts = await this.prisma.contract.findMany({
      where: {
        contractType: ContractType.Pawn,
        status: { in: [ContractStatus.Overdue, ContractStatus.Forfeited] },
      },
      select: { id: true },
    });

    let provisionedCount = 0;
    for (const contract of contracts) {
      try {
        const amount = await this.accountingEventsListener.provisionOverdueDebt(contract.id);
        if (amount) provisionedCount += 1;
      } catch (error) {
        this.logger.error(`Fallo provisionando el contrato ${contract.id}`, error as Error);
      }
    }

    this.logger.log(`Provisión diaria: ${provisionedCount}/${contracts.length} contratos con provisión nueva`);
  }
}
