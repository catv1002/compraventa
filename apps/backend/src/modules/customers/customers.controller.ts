import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { UserRole } from '@prisma/client';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Customer', 'CustomerRegistered')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.create(dto, user);
  }

  @Post('import')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('Customer', 'CustomersImported')
  importRows(@Body() dto: ImportCustomersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.importRows(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.findOne(id, user);
  }

  @Patch(':id/flag')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('Customer', 'CustomerFlagged')
  setFlagged(
    @Param('id') id: string,
    @Body('flagged') flagged: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.setFlagged(id, flagged, user);
  }
}
