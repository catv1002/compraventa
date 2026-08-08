import { Injectable } from '@nestjs/common';
import { MetalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { SetMetalPriceDto } from './dto/set-metal-price.dto';

@Injectable()
export class MetalPricesService {
  constructor(private readonly prisma: PrismaService) {}

  // Histórico append-only (ver comentario del modelo en schema.prisma): nunca
  // se actualiza una fila, se inserta una nueva vigente desde su createdAt.
  set(dto: SetMetalPriceDto, currentUser: AuthenticatedUser) {
    return this.prisma.metalPrice.create({
      data: {
        tenantId: currentUser.tenantId,
        metal: dto.metal,
        pricePerGramFine: dto.pricePerGramFine,
        setById: currentUser.userId,
      },
    });
  }

  /**
   * Última cotización de cada metal para el tenant. Un metal sin cotización
   * nunca registrada se devuelve como `null` — nunca se inventa un precio en
   * cero, que un tasador desprevenido podría leer como "la joya no vale nada".
   */
  async current(currentUser: AuthenticatedUser): Promise<Record<MetalType, Awaited<ReturnType<typeof this.latestFor>>>> {
    const metals: MetalType[] = [MetalType.Gold, MetalType.Silver, MetalType.Platinum];
    const results = await Promise.all(metals.map((metal) => this.latestFor(metal, currentUser)));
    return {
      Gold: results[0],
      Silver: results[1],
      Platinum: results[2],
    } as Record<MetalType, Awaited<ReturnType<typeof this.latestFor>>>;
  }

  latestFor(metal: MetalType, currentUser: AuthenticatedUser) {
    return this.prisma.metalPrice.findFirst({
      where: { tenantId: currentUser.tenantId, metal },
      orderBy: { createdAt: 'desc' },
    });
  }

  history(metal: MetalType, currentUser: AuthenticatedUser) {
    return this.prisma.metalPrice.findMany({
      where: { tenantId: currentUser.tenantId, metal },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
