import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Gestión de usuarios: exclusivamente Admin. Distinto del cupo de compra
// (PurchaseAllowancesModule), que un BranchManager sí administra a diario —
// aquí se maneja quién existe en el sistema y con qué rol/sucursal/estado.
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Audited('User', 'UserCreated')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    return this.usersService.findAll(user, branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  @Audited('User', 'UserUpdated', { capturePrevious: true })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.update(id, dto, user);
  }
}
