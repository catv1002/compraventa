import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { AuthenticatedUser } from '../security/current-user.decorator';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDto, currentUser: AuthenticatedUser) {
    const { reference, ...customerData } = dto;

    return this.prisma.customer.create({
      data: {
        ...customerData,
        tenantId: currentUser.tenantId,
        references: reference ? { create: [reference] } : undefined,
      },
      include: { references: true },
    });
  }

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.customer.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { references: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { documents: true, contracts: true, references: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  async setFlagged(id: string, flagged: boolean, currentUser: AuthenticatedUser) {
    await this.findOne(id, currentUser);
    return this.prisma.customer.update({ where: { id }, data: { flagged } });
  }
}
