import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBranchDto, currentUser: AuthenticatedUser) {
    return this.prisma.branch.create({
      data: { tenantId: currentUser.tenantId, name: dto.name, address: dto.address },
    });
  }

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.branch.findMany({ where: { tenantId: currentUser.tenantId } });
  }

  async update(id: string, dto: UpdateBranchDto, currentUser: AuthenticatedUser) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    if (dto.active === false) {
      const otherActiveCount = await this.prisma.branch.count({
        where: { tenantId: currentUser.tenantId, active: true, id: { not: id } },
      });
      if (otherActiveCount === 0) {
        throw new BadRequestException('No puedes desactivar la única sucursal activa del tenant');
      }
    }

    return this.prisma.branch.update({
      where: { id },
      data: { name: dto.name, address: dto.address, active: dto.active },
    });
  }
}
