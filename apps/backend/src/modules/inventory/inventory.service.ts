import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../security/current-user.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ImportItemsDto } from './dto/import-items.dto';

export interface ImportRowResult {
  row: number;
  status: 'created' | 'error';
  itemId?: string;
  reason?: string;
}
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

    // `qrCode` es lo que se imprime/codifica en la etiqueta física del
    // artículo — se fija al propio id (ya único) porque no hay todavía una
    // numeración de códigos independiente del negocio; permite que el
    // escaneo (BarcodeScanButton) resuelva por código real en vez de
    // depender de que el operador conozca el prefijo del uuid.
    const withCode = await this.prisma.item.update({
      where: { id: item.id },
      data: { qrCode: item.id },
      include: { attributes: true, category: true },
    });

    await this.eventEmitter.emitAsync(
      DomainEventNames.ItemReceived,
      new ItemReceivedEvent(item.id, item.categoryId, item.branchId),
    );

    return withCode;
  }

  /**
   * Importación masiva de inventario desde CSV (ver ImportPage). La clase de
   * artículo se busca por nombre o por `legacyCode` (el código de 5 dígitos
   * del sistema legado, "00102") — así una migración puede traer el código
   * tal cual venía sin tener que remapearlo a mano fila por fila. Fila por
   * fila, no todo-o-nada: un peso faltante en una fila no debe descartar el
   * resto del archivo — mismo criterio que `CustomersService.importRows`.
   */
  async importItems(dto: ImportItemsDto, currentUser: AuthenticatedUser): Promise<ImportRowResult[]> {
    const categories = await this.prisma.category.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { parentCategory: true },
    });

    const results: ImportRowResult[] = [];

    for (const [index, row] of dto.rows.entries()) {
      const rowNumber = index + 2;
      const categoryQuery = row.category?.trim();
      if (!categoryQuery) {
        results.push({ row: rowNumber, status: 'error', reason: 'Falta la clase de artículo' });
        continue;
      }

      const category = categories.find((c) => {
        if (c.name.toLowerCase() === categoryQuery.toLowerCase()) return true;
        const schema = resolveAttributeSchema(c.attributeSchema, c.parentCategory?.attributeSchema);
        return schema.legacyCode === categoryQuery;
      });
      if (!category) {
        results.push({ row: rowNumber, status: 'error', reason: `Clase de artículo "${categoryQuery}" no encontrada` });
        continue;
      }

      const schema = resolveAttributeSchema(category.attributeSchema, category.parentCategory?.attributeSchema);
      const attributeInputs: { key: string; value: string }[] = [];
      if (row.weightGrams?.trim()) attributeInputs.push({ key: 'weightGrams', value: row.weightGrams.trim() });
      if (row.karats?.trim()) attributeInputs.push({ key: 'karats', value: row.karats.trim() });

      const validation = validateItemAttributes(attributeInputs, schema, category.name);
      if (!validation.ok) {
        results.push({ row: rowNumber, status: 'error', reason: validation.errors.join('; ') });
        continue;
      }

      const costBasisRaw = row.costBasis?.trim();
      const costBasis = costBasisRaw ? Number(costBasisRaw) : 0;
      if (costBasisRaw && (Number.isNaN(costBasis) || costBasis < 0)) {
        results.push({ row: rowNumber, status: 'error', reason: `Costo inválido: "${costBasisRaw}"` });
        continue;
      }

      try {
        const item = await this.prisma.item.create({
          data: {
            tenantId: currentUser.tenantId,
            branchId: currentUser.homeBranchId,
            categoryId: category.id,
            serialNumber: row.serialNumber?.trim() || undefined,
            description: row.description?.trim() || undefined,
            status: ItemStatus.Received,
            costBasis,
            attributes:
              validation.attributes.length > 0 ? { createMany: { data: validation.attributes } } : undefined,
          },
        });
        results.push({ row: rowNumber, status: 'created', itemId: item.id });
      } catch (err) {
        results.push({
          row: rowNumber,
          status: 'error',
          reason: err instanceof Error ? err.message : 'Error desconocido al crear el artículo',
        });
      }
    }

    return results;
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

  // Coincidencia exacta contra los tres identificadores físicos posibles: el
  // propio id (el qrCode hoy se fija igual al id, ver createItem), el
  // qrCode explícito (por si en el futuro se desacopla del id) y el serial
  // del fabricante. `null` en vez de excepción: es una búsqueda, no una
  // confirmación de existencia — el llamante decide qué hacer si no hay match.
  async findByCode(code: string, currentUser: AuthenticatedUser) {
    const trimmed = code.trim();
    if (!trimmed) return null;

    return this.prisma.item.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        OR: [{ id: trimmed }, { qrCode: trimmed }, { serialNumber: trimmed }],
      },
      include: { attributes: true, category: true },
    });
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
