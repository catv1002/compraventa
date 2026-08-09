import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ContractStatus, PaymentMethod, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { CreateSaleTicketDto } from './dto/create-sale-ticket.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { SettleContractDto } from './dto/settle-contract.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { PayInterestDto } from './dto/pay-interest.dto';
import { PayPrincipalDto } from './dto/pay-principal.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'ContractCreated')
  create(@Body() dto: CreateContractDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.create(dto, user);
  }

  /**
   * Venta de mostrador multi-artículo (Option B): crea un Contract Sale por
   * cada línea del carrito, agrupados por `saleTicketId`. Ver el comentario
   * de `ContractsService.createSaleTicket`.
   */
  @Post('sale-tickets')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'SaleTicketCreated')
  createSaleTicket(@Body() dto: CreateSaleTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.createSaleTicket(dto, user);
  }

  /** Comprobante combinado del ticket de venta multi-artículo. */
  @Get('sale-tickets/:saleTicketId/receipt')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  getSaleTicketReceipt(@Param('saleTicketId') saleTicketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.getSaleTicketReceiptData(saleTicketId, user);
  }

  @Get()
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: ContractStatus) {
    return this.contractsService.findAll(user, status);
  }

  @Get(':id')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.findOne(id, user);
  }

  /**
   * Comprobante imprimible de mostrador — no pasa por el módulo de
   * facturación electrónica DIAN (ver comentario en
   * `ContractsService.getReceiptData`).
   */
  @Get(':id/receipt')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  getReceipt(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.getReceiptData(id, user);
  }

  @Post(':id/disburse')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'DisbursementIssued', { capturePrevious: true })
  disburse(
    @Param('id') id: string,
    @Query('cashRegisterId') cashRegisterId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('paymentMethod') paymentMethod?: PaymentMethod,
  ) {
    return this.contractsService.disburseContract(id, cashRegisterId, user, paymentMethod ?? PaymentMethod.Cash);
  }

  @Post(':id/withdraw')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'ContractWithdrawn', { capturePrevious: true })
  withdraw(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.withdraw(id, user);
  }

  @Post(':id/return-sale')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  @Audited('Contract', 'SaleReturned', { capturePrevious: true })
  returnSale(@Param('id') id: string, @Body() dto: ReturnSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.returnSale(id, dto.cashRegisterId, user, dto.paymentMethod);
  }


  /**
   * Cuánto debe el contrato hoy. Solo lectura — es la consulta que el operador
   * hace frente al cliente antes de cobrar nada.
   */
  @Get(':id/quote')
  @Roles(UserRole.SalesAdvisor, UserRole.BranchManager, UserRole.Admin)
  quote(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('asOf') asOf?: string,
  ) {
    return this.contractsService.getQuote(id, user, asOf ? new Date(asOf) : undefined);
  }

  /** Pago de intereses por número de meses (RN-04). No altera el vencimiento. */
  @Post(':id/interest')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'InterestPaymentRecorded', { capturePrevious: true })
  payInterest(
    @Param('id') id: string,
    @Body() dto: PayInterestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contractsService.payInterest(id, dto, user);
  }

  /** Abono a capital. Se rechaza si hay intereses en mora (RN-03). */
  @Post(':id/principal')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'PrincipalPaymentRecorded', { capturePrevious: true })
  payPrincipal(
    @Param('id') id: string,
    @Body() dto: PayPrincipalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contractsService.payPrincipal(id, dto, user);
  }

  @Post(':id/renew')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'ContractRenewed', { capturePrevious: true })
  // Renovar ya no mueve caja: el pago de intereses es POST :id/interest.
  renew(@Param('id') id: string, @Body() dto: RenewContractDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.renew(id, dto, user);
  }

  @Post(':id/settle')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'ContractSettled', { capturePrevious: true })
  settle(
    @Param('id') id: string,
    @Body() dto: SettleContractDto,
    @Query('cashRegisterId') cashRegisterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contractsService.settle(id, dto, cashRegisterId, user);
  }

  @Post('process-overdue')
  @Roles(UserRole.Admin, UserRole.BranchManager)
  processOverdue(@CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.processOverdueContracts(user.tenantId);
  }

  /** Listado de candidatos a remate por antigüedad configurable (RN-05). */
  @Get('forfeiture/candidates')
  @Roles(UserRole.Admin, UserRole.BranchManager)
  forfeitureCandidates(@CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.listForfeitureCandidates(user);
  }

  /**
   * Remate de una selección explícita. Restringido a Gerencia: es la decisión
   * que hoy toma la dueña contrato por contrato, no un proceso automático.
   */
  @Post('forfeiture/process')
  @Roles(UserRole.Admin, UserRole.BranchManager)
  @Audited('Contract', 'ContractDefaulted', { capturePrevious: true })
  forfeit(@Body('contractIds') contractIds: string[], @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.forfeitContracts(contractIds ?? [], user);
  }

  @Post(':id/installment')
  @Roles(UserRole.SalesAdvisor, UserRole.Admin)
  @Audited('Contract', 'PrincipalPaymentRecorded', { capturePrevious: true })
  payInstallment(@Param('id') id: string, @Body() dto: PayInstallmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.payInstallment(id, dto, user);
  }

  @Post(':id/cancel-layaway')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('Contract', 'LayawayCancelled', { capturePrevious: true })
  cancelLayaway(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('penaltyAmount') penaltyAmount?: number,
    @Body('cashRegisterId') cashRegisterId?: string,
  ) {
    return this.contractsService.cancelLayaway(id, penaltyAmount ?? 0, user, cashRegisterId);
  }
}
