import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('BranchTransfer', 'TransferInitiated')
  initiate(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.initiate(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.findAll(user);
  }

  @Post(':id/dispatch')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('BranchTransfer', 'TransferDispatched')
  dispatch(@Param('id') id: string) {
    return this.transfersService.dispatch(id);
  }

  @Post(':id/receive')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('BranchTransfer', 'TransferReceived')
  receive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.receive(id, user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('BranchTransfer', 'TransferCancelled')
  cancel(@Param('id') id: string) {
    return this.transfersService.cancel(id);
  }
}
