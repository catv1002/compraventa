import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';
import { CreateAppraisalDto } from './dto/create-appraisal.dto';
import { DomainEventNames, ItemAppraisedEvent } from '../../shared/domain-events/events';

@Injectable()
export class AppraisalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
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
}
