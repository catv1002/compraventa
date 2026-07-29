import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Accountant, UserRole.Admin, UserRole.Auditor)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('journal-entries')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.findAll(user, from, to);
  }

  @Get('income-statement')
  incomeStatement(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.incomeStatement(user, from, to);
  }
}
