import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { DIAN_PROVIDER, DianProvider } from './dian-provider.interface';
import { DomainEventNames, InvoiceIssuedEvent } from '../../shared/domain-events/events';

// Ver docs/03-dominios-ddd.md (8. Facturación) y dian-provider.interface.ts —
// la emisión real a DIAN requiere un proveedor tecnológico contratado aparte.
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DIAN_PROVIDER) private readonly dianProvider: DianProvider,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  create(dto: CreateInvoiceDto, currentUser: AuthenticatedUser) {
    const total = dto.lines.reduce((sum, l) => sum + l.price + l.vat, 0);
    const vatTotal = dto.lines.reduce((sum, l) => sum + l.vat, 0);

    return this.prisma.invoice.create({
      data: {
        tenantId: currentUser.tenantId,
        customerId: dto.customerId,
        contractId: dto.contractId,
        status: InvoiceStatus.Draft,
        total,
        vatTotal,
        lines: { create: dto.lines.map((l) => ({ itemId: l.itemId, description: l.description, price: l.price, vat: l.vat })) },
      },
      include: { lines: true },
    });
  }

  async issue(id: string, currentUser: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId: currentUser.tenantId } });
    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }
    if (invoice.status !== InvoiceStatus.Draft) {
      throw new BadRequestException('Solo se pueden emitir facturas en borrador');
    }

    const result = await this.dianProvider.submitInvoice({
      id: invoice.id,
      total: Number(invoice.total),
      vatTotal: Number(invoice.vatTotal),
    });

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: result.accepted ? InvoiceStatus.Issued : InvoiceStatus.Rejected,
        cufe: result.cufe,
      },
    });

    if (result.accepted) {
      await this.eventEmitter.emitAsync(
        DomainEventNames.InvoiceIssued,
        new InvoiceIssuedEvent(invoice.id, Number(invoice.total), Number(invoice.vatTotal)),
      );
    }

    return updated;
  }

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.invoice.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { lines: true, customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { lines: true, customer: true },
    });
    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }
    return invoice;
  }
}
