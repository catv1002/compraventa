import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { CollectionsService } from './collections.service';
import { LogContactDto } from './dto/log-contact.dto';

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('upcoming')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  upcoming(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.collectionsService.upcoming(user, days ? Number(days) : 7);
  }

  @Get('overdue')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  overdue(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.overdue(user);
  }

  @Get('recovery-rate')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  recoveryRate(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.recoveryRate(user);
  }

  @Post(':contractId/contact')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('CollectionContactAttempt', 'CollectionCaseLogged')
  logContact(
    @Param('contractId') contractId: string,
    @Body() dto: LogContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.collectionsService.logContact(contractId, dto, user);
  }

  @Get(':contractId/contact')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  contactHistory(@Param('contractId') contractId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.contactHistory(contractId, user);
  }
}
