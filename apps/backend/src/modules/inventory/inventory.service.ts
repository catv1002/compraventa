import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { DomainEventNames, ItemReceivedEvent } from '../../shared/domain-events/events';
import { resolveAttributeSchema, validateItemAttributes } from './attributes/attribute-validator';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createCategory(dto: CreateCategoryDto, currentUser: AuthenticatedUser) {
    // El padre se resuelve dentro del tenant: sin esto se podría colgar una
    // categoría del árbol de otra empresa conociendo su uuid (CV-016).
    if (dto.parentCategoryId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentCategoryId, tenantId: currentUser.tenantId },
      });
      if (!parent) {
        throw new NotFoundException('Categoría padre no encontrada');
      }
    }

    return this.prisma.category.create({
      data: {
        tenantId: currentUser.tenantId,
        name: dto.name,
        parentCategoryId: dto.parentCategoryId,
        attributeSchema: (dto.attributeSchema as any) ?? { attributes: [] },
      },
    });
  }

  /**
   * Devuelve el catálogo con el **esquema efectivo ya resuelto** (propio +
   * heredado del padre) y el código del legado aplanado, para que el formulario
   * de alta pueda generarse desde el esquema (docs/09 §2) sin volver a pedir el
   * padre ni reimplementar la herencia en el cliente.
   */
  async listCategories(currentUser: AuthenticatedUser) {
    const categories = await this.prisma.category.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { parentCategory: true },
      orderBy: { name: 'asc' },
    });

    return categories.map((category) => {
      const schema = resolveAttributeSchema(
        category.attributeSchema,
        category.parentCategory?.attributeSchema,
      );

      return {
        id: category.id,
        name: category.name,
        parentCategoryId: category.parentCategoryId,
        parentCategoryName: category.parentCategory?.name ?? null,
        legacyCode: schema.legacyCode ?? null,
        attributeSchema: schema,
      };
    });
  }

  async createItem(dto: CreateItemDto, currentUser: AuthenticatedUser) {
    // La categoría se busca dentro del tenant: además de aislar (CV-016), es de
    // donde sale el esquema contra el que se valida.
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, tenantId: currentUser.tenantId },
      include: { parentCategory: true },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    // CV-020: hasta ahora `dto.attributes` se persistía sin mirar el esquema,
    // pese a que docs/09 §2 afirmaba lo contrario. Consecuencia práctica: se
    // registraban joyas sin peso, que es el dato con el que el negocio las
    // valora (docs/11 §3.6, D-10). La regla vive en `attributes/attribute-validator.ts`,
    // pura y probada sin base de datos.
    const schema = resolveAttributeSchema(
      category.attributeSchema,
      category.parentCategory?.attributeSchema,
    );
    const validation = validateItemAttributes(dto.attributes, schema, category.name);

    if (!validation.ok) {
      throw new BadRequestException(validation.errors);
    }

    const item = await this.prisma.item.create({
      data: {
        tenantId: currentUser.tenantId,
        branchId: currentUser.homeBranchId,
        categoryId: category.id,
        serialNumber: dto.serialNumber,
        description: dto.description,
        status: ItemStatus.Received,
        attributes:
          validation.attributes.length > 0
            ? { createMany: { data: validation.attributes } }
            : undefined,
      },
      include: { attributes: true, category: true },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.ItemReceived,
      new ItemReceivedEvent(item.id, item.categoryId, item.branchId),
    );

    return item;
  }

  listItems(
    currentUser: AuthenticatedUser,
    filters: { status?: ItemStatus; categoryId?: string },
  ) {
    return this.prisma.item.findMany({
      where: {
        tenantId: currentUser.tenantId,
        status: filters.status,
        categoryId: filters.categoryId,
      },
      include: { attributes: true, category: true, photos: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { attributes: true, category: true, photos: true, appraisals: true },
    });

    if (!item) {
      throw new NotFoundException('Artículo no encontrado');
    }

    return item;
  }

  // Corrige un error de captura (peso/quilataje/descripción/serie) — SOLO
  // mientras el artículo sigue en `Received`. Una vez avaluado (`Appraised`)
  // el peso ya alimentó un `Appraisal.appraisedValue` y potencialmente un
  // `Contract`; cambiarlo después dejaría el avalúo/contrato calculado sobre
  // un dato que ya no es el vigente, sin ninguna pista de que divergieron.
  // Para ese caso el camino correcto es retirar/anular el contrato, no editar
  // el artículo por debajo — ver ContractsService.withdraw().
  async updateItem(id: string, dto: UpdateItemDto, currentUser: AuthenticatedUser) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { category: { include: { parentCategory: true } } },
    });
    if (!item) {
      throw new NotFoundException('Artículo no encontrado');
    }
    if (item.status !== ItemStatus.Received) {
      throw new BadRequestException(
        `Solo se puede editar un artículo en estado Received (actual: ${item.status})`,
      );
    }

    if (dto.attributes) {
      const schema = resolveAttributeSchema(
        item.category.attributeSchema,
        item.category.parentCategory?.attributeSchema,
      );
      const validation = validateItemAttributes(dto.attributes, schema, item.category.name);
      if (!validation.ok) {
        throw new BadRequestException(validation.errors);
      }
      await this.prisma.$transaction([
        this.prisma.dynamicAttribute.deleteMany({ where: { itemId: id } }),
        this.prisma.dynamicAttribute.createMany({
          data: validation.attributes.map((a) => ({ ...a, itemId: id })),
        }),
      ]);
    }

    return this.prisma.item.update({
      where: { id },
      data: {
        serialNumber: dto.serialNumber,
        description: dto.description,
      },
      include: { attributes: true, category: true, photos: true },
    });
  }

  // El artículo devuelto (`ItemStatus.Returned`, ver ContractsService.returnSale)
  // no vuelve solo a la vitrina: alguien con autoridad de sucursal confirma
  // que está en condiciones de venderse de nuevo antes de que reaparezca en
  // inventario disponible.
  async restockItem(id: string, currentUser: AuthenticatedUser) {
    const item = await this.findOne(id, currentUser);
    if (item.status !== ItemStatus.Returned) {
      throw new BadRequestException(`El artículo no está en estado Returned (actual: ${item.status})`);
    }
    return this.transitionStatus(id, ItemStatus.InStock);
  }

  // Usado internamente por Appraisals/Contracts para mover el artículo en su
  // máquina de estados — ver docs/02-ciclos-de-vida.md.
  async transitionStatus(id: string, status: ItemStatus) {
    return this.prisma.item.update({ where: { id }, data: { status } });
  }

  // Usado por Branches/Transfers al completar un traslado.
  async moveToBranch(id: string, branchId: string, status: ItemStatus) {
    return this.prisma.item.update({ where: { id }, data: { branchId, status } });
  }

  // Usado por Contracts (DirectPurchase) y Workshop para capitalizar el costo
  // invertido en el artículo (ver docs/03-dominios-ddd.md, Taller).
  async incrementCostBasis(id: string, amount: number) {
    return this.prisma.item.update({ where: { id }, data: { costBasis: { increment: amount } } });
  }
}
