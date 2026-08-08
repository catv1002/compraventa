import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemStatus, RepairOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';
import { CreateRepairOrderDto } from './dto/create-repair-order.dto';
import { AddSparePartDto } from './dto/add-spare-part.dto';
import { DomainEventNames, RepairCompletedEvent } from '../../shared/domain-events/events';

@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateRepairOrderDto, currentUser: AuthenticatedUser) {
    const item = await this.inventoryService.findOne(dto.itemId, currentUser);
    if (item.status !== ItemStatus.InStock) {
      throw new BadRequestException('Solo se puede reparar un artículo en estado InStock');
    }

    const order = await this.prisma.repairOrder.create({
      data: {
        itemId: dto.itemId,
        technicianId: currentUser.userId,
        diagnosis: dto.diagnosis,
        status: RepairOrderStatus.Open,
      },
    });

    await this.inventoryService.transitionStatus(dto.itemId, ItemStatus.InRepair);

    return order;
  }

  async addSparePart(orderId: string, dto: AddSparePartDto, currentUser: AuthenticatedUser) {
    const order = await this.getOpenOrder(orderId, currentUser);
    await this.prisma.sparePart.create({
      data: { repairOrderId: order.id, description: dto.description, cost: dto.cost },
    });
    return this.prisma.repairOrder.update({
      where: { id: order.id },
      data: { totalCost: { increment: dto.cost } },
      include: { spareParts: true },
    });
  }

  async complete(orderId: string, currentUser: AuthenticatedUser) {
    const order = await this.getOpenOrder(orderId, currentUser);

    const completed = await this.prisma.repairOrder.update({
      where: { id: order.id },
      data: { status: RepairOrderStatus.Completed, completedAt: new Date() },
      include: { spareParts: true },
    });

    await this.inventoryService.transitionStatus(order.itemId, ItemStatus.InStock);
    await this.inventoryService.incrementCostBasis(order.itemId, Number(completed.totalCost));

    await this.eventEmitter.emitAsync(
      DomainEventNames.RepairCompleted,
      new RepairCompletedEvent(order.itemId, Number(completed.totalCost)),
    );

    return completed;
  }

  async cancel(orderId: string, currentUser: AuthenticatedUser) {
    const order = await this.getOpenOrder(orderId, currentUser);
    await this.inventoryService.transitionStatus(order.itemId, ItemStatus.InStock);
    return this.prisma.repairOrder.update({
      where: { id: order.id },
      data: { status: RepairOrderStatus.Cancelled },
    });
  }

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.repairOrder.findMany({
      where: { item: { tenantId: currentUser.tenantId } },
      include: { item: true, spareParts: true, technician: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Aislamiento multi-tenant: `RepairOrder` no lleva `tenantId` propio, así
  // que se filtra a través del artículo (CV-016). Sin esto, conocer un
  // `orderId` ajeno bastaría para operar la orden de reparación de otra
  // empresa.
  private async getOpenOrder(id: string, currentUser: AuthenticatedUser) {
    const order = await this.prisma.repairOrder.findFirst({
      where: { id, item: { tenantId: currentUser.tenantId } },
    });
    if (!order) {
      throw new NotFoundException('Orden de reparación no encontrada');
    }
    if (order.status !== RepairOrderStatus.Open) {
      throw new BadRequestException('La orden de reparación no está abierta');
    }
    return order;
  }
}
