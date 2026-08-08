import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Nunca se selecciona passwordHash ni mfaSecret hacia afuera: se excluyen con
// `select`, no con `delete obj.field` tras el hecho — así no hay forma de que
// un campo nuevo del modelo se filtre por accidente en una respuesta futura.
const SAFE_USER_SELECT = {
  id: true,
  tenantId: true,
  homeBranchId: true,
  email: true,
  fullName: true,
  role: true,
  mfaEnabled: true,
  active: true,
  createdAt: true,
  homeBranch: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, currentUser: AuthenticatedUser) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.homeBranchId, tenantId: currentUser.tenantId },
    });
    if (!branch) {
      throw new BadRequestException('La sucursal indicada no existe');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.user.create({
        data: {
          tenantId: currentUser.tenantId,
          homeBranchId: dto.homeBranchId,
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          passwordHash,
          active: true,
          mfaEnabled: false,
        },
        select: SAFE_USER_SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
      throw err;
    }
  }

  findAll(currentUser: AuthenticatedUser, branchId?: string) {
    return this.prisma.user.findMany({
      where: { tenantId: currentUser.tenantId, ...(branchId ? { homeBranchId: branchId } : {}) },
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      select: SAFE_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto, currentUser: AuthenticatedUser) {
    await this.findOne(id, currentUser);

    if (currentUser.userId === id && dto.active === false) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    if (dto.homeBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.homeBranchId, tenantId: currentUser.tenantId },
      });
      if (!branch) {
        throw new BadRequestException('La sucursal indicada no existe');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        homeBranchId: dto.homeBranchId,
        active: dto.active,
      },
      select: SAFE_USER_SELECT,
    });
  }
}
