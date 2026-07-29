import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';

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
}
