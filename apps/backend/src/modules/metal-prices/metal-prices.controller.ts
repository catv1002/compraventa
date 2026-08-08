import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MetalType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../security/current-user.decorator';
import { Audited } from '../../shared/audit/audited.decorator';
import { MetalPricesService } from './metal-prices.service';
import { SetMetalPriceDto } from './dto/set-metal-price.dto';

@Controller('metal-prices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetalPricesController {
  constructor(private readonly metalPricesService: MetalPricesService) {}

  // Solo BranchManager/Admin mueven este número: cambia lo que sugiere cada
  // avalúo de la sucursal, no es un dato que digite un vendedor de mostrador.
  @Post()
  @Roles(UserRole.BranchManager, UserRole.Admin)
  @Audited('MetalPrice', 'MetalPriceSet')
  set(@Body() dto: SetMetalPriceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.metalPricesService.set(dto, user);
  }

  // Cualquier rol autenticado: la pantalla de avalúo la necesita para mostrar
  // la sugerencia, sin importar quién esté tasando.
  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.metalPricesService.current(user);
  }

  @Get('history')
  @Roles(UserRole.BranchManager, UserRole.Admin)
  history(@Query('metal') metal: string, @CurrentUser() user: AuthenticatedUser) {
    if (!Object.values(MetalType).includes(metal as MetalType)) {
      throw new BadRequestException('metal debe ser uno de: Gold, Silver, Platinum');
    }
    return this.metalPricesService.history(metal as MetalType, user);
  }
}
