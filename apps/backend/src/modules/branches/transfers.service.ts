import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemStatus, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { DomainEventNames, TransferReceivedEvent } from '../../shared/domain-events/events';

// Máquina de estados de traslado: Requested -> InTransit -> Received | Cancelled
// Ver docs/05-multisucursal-auditoria.md (2. Traslados entre sucursales).
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async initiate(dto: CreateTransferDto, currentUser: AuthenticatedUser) {
    const item = await this.inventoryService.findOne(dto.itemId, currentUser);
    if (item.status !== ItemStatus.InStock) {
      throw new BadRequestException('Solo se pueden trasladar artículos en estado InStock');
    }

    const transfer = await this.prisma.branchTransfer.create({
      data: {
        itemId: dto.itemId,
        fromBranchId: currentUser.homeBranchId,
        toBranchId: dto.toBranchId,
        requestedById: currentUser.userId,
        status: TransferStatus.Requested,
      },
    });

    await this.inventoryService.transitionStatus(dto.itemId, ItemStatus.InTransit);

    return transfer;
  }

  async dispatch(id: string) {
    const transfer = await this.getByStatus(id, TransferStatus.Requested);
    return this.prisma.branchTransfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.InTransit },
    });
  }

  async receive(id: string, currentUser: AuthenticatedUser) {
    const transfer = await this.getByStatus(id, TransferStatus.InTransit);

    await this.inventoryService.moveToBranch(transfer.itemId, transfer.toBranchId, ItemStatus.InStock);

    const received = await this.prisma.branchTransfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.Received, receivedById: currentUser.userId, receivedAt: new Date() },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.TransferReceived,
      new TransferReceivedEvent(transfer.itemId, transfer.toBranchId),
    );

    return received;
  }

  async cancel(id: string) {
    const transfer = await this.prisma.branchTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.status === TransferStatus.Received || transfer.status === TransferStatus.Cancelled) {
      throw new BadRequestException('El traslado no admite cancelación en su estado actual');
    }

    await this.inventoryService.transitionStatus(transfer.itemId, ItemStatus.InStock);

    return this.prisma.branchTransfer.update({
      where: { id },
      data: { status: TransferStatus.Cancelled },
    });
  }

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.branchTransfer.findMany({
      where: { fromBranch: { tenantId: currentUser.tenantId } },
      include: { item: true, fromBranch: true, toBranch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getByStatus(id: string, status: TransferStatus) {
    const transfer = await this.prisma.branchTransfer.findUnique({ where: { id } });
    if (!transfer) {
      throw new NotFoundException('Traslado no encontrado');
    }
    if (transfer.status !== status) {
      throw new BadRequestException(`El traslado debe estar en estado ${status} para esta operación`);
    }
    return transfer;
  }
}
