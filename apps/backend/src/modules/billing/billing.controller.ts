import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Invoice', 'InvoiceDrafted')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.create(dto, user);
  }

  // BranchManager se agrega frente a `create`/`issue` (SalesAdvisor/Admin):
  // gerencia necesita ver facturas para supervisión aunque no las redacte.
  @Get()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.findOne(id, user);
  }

  @Post(':id/issue')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Invoice', 'InvoiceIssued')
  issue(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.issue(id, user);
  }
}
