import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';
import { MetalPricesService } from '../metal-prices/metal-prices.service';
import { KARAT_PURITY } from '../inventory/jewelry-catalog';
import { CreateAppraisalDto } from './dto/create-appraisal.dto';
import { DomainEventNames, ItemAppraisedEvent } from '../../shared/domain-events/events';

export interface SuggestedValueResult {
  suggestedValue: number | null;
  reason?: string;
  metal?: string;
  purity?: number;
  weightGrams?: number;
  pricePerGramFine?: number;
  priceSetAt?: Date;
}

@Injectable()
export class AppraisalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly metalPricesService: MetalPricesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(itemId: string, dto: CreateAppraisalDto, currentUser: AuthenticatedUser) {
    const item = await this.inventoryService.findOne(itemId, currentUser);

    if (item.status !== ItemStatus.Received) {
      throw new BadRequestException(
        `Solo se puede avaluar un artículo en estado Received (actual: ${item.status})`,
      );
    }

    const appraisal = await this.prisma.appraisal.create({
      data: {
        itemId,
        appraisedById: currentUser.userId,
        appraisedValue: dto.appraisedValue,
        loanablePercentage: dto.loanablePercentage,
        notes: dto.notes,
      },
    });

    await this.inventoryService.transitionStatus(itemId, ItemStatus.Appraised);

    await this.eventEmitter.emitAsync(
      DomainEventNames.ItemAppraised,
      new ItemAppraisedEvent(itemId, dto.appraisedValue, dto.loanablePercentage),
    );

    return appraisal;
  }

  findByItem(itemId: string) {
    return this.prisma.appraisal.findMany({ where: { itemId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Valor sugerido = peso × pureza del quilataje × cotización vigente del
   * metal (CV-032). Es una ayuda, no un cálculo obligatorio: si falta un dato
   * o no hay cotización, se devuelve `suggestedValue: null` con el motivo —
   * nunca se lanza una excepción, el tasador siempre puede seguir avaluando
   * a mano.
   */
  async suggestValue(itemId: string, currentUser: AuthenticatedUser): Promise<SuggestedValueResult> {
    const item = await this.inventoryService.findOne(itemId, currentUser);

    const weightAttr = item.attributes.find((a) => a.key === 'weightGrams');
    const karatsAttr = item.attributes.find((a) => a.key === 'karats');

    if (!weightAttr || !karatsAttr) {
      return {
        suggestedValue: null,
        reason: 'Sin datos suficientes para calcular (falta peso/quilataje, o metal no catalogado)',
      };
    }

    const purityInfo = KARAT_PURITY[karatsAttr.value as keyof typeof KARAT_PURITY];
    if (!purityInfo) {
      return {
        suggestedValue: null,
        reason: 'Sin datos suficientes para calcular (falta peso/quilataje, o metal no catalogado)',
      };
    }

    const weightGrams = Number(weightAttr.value);
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      return {
        suggestedValue: null,
        reason: 'Sin datos suficientes para calcular (falta peso/quilataje, o metal no catalogado)',
      };
    }

    const latestPrice = await this.metalPricesService.latestFor(purityInfo.metal, currentUser);
    if (!latestPrice) {
      return {
        suggestedValue: null,
        reason: `No hay cotización de ${purityInfo.metal} registrada para hoy`,
        metal: purityInfo.metal,
        purity: purityInfo.purity,
        weightGrams,
      };
    }

    const pricePerGramFine = Number(latestPrice.pricePerGramFine);
    const rawValue = weightGrams * purityInfo.purity * pricePerGramFine;

    return {
      suggestedValue: Math.round(rawValue),
      metal: purityInfo.metal,
      purity: purityInfo.purity,
      weightGrams,
      pricePerGramFine,
      priceSetAt: latestPrice.createdAt,
    };
  }
}
