import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { AuthenticatedUser } from '../security/current-user.decorator';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ImportRowResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  identificationNumber?: string;
  reason?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDto, currentUser: AuthenticatedUser) {
    const { reference, ...customerData } = dto;

    return this.prisma.customer.create({
      data: {
        ...customerData,
        tenantId: currentUser.tenantId,
        references: reference ? { create: [reference] } : undefined,
      },
      include: { references: true },
    });
  }

  /**
   * Importación masiva desde CSV (parseado en el navegador, ver `ImportPage`).
   * Fila por fila, todo o nada NO aplica aquí a propósito: si la fila 214 de
   * 300 tiene la cédula vacía, las otras 299 igual deben quedar creadas —
   * lo contrario obliga a limpiar el archivo entero para recuperar una
   * fila. Duplicados por `identificationNumber` (ya sembrado o repetido
   * dentro del mismo archivo) se reportan como `skipped`, no `error`: no es
   * un dato inválido, es un cliente que ya existe.
   */
  async importRows(dto: ImportCustomersDto, currentUser: AuthenticatedUser): Promise<ImportRowResult[]> {
    const results: ImportRowResult[] = [];
    const seenInFile = new Set<string>();

    for (const [index, row] of dto.rows.entries()) {
      const rowNumber = index + 2; // +1 por índice base 1, +1 por la fila de encabezado del CSV
      const fullName = row.fullName?.trim();
      const identificationNumber = row.identificationNumber?.trim();
      const phone = row.phone?.trim();
      const address = row.address?.trim();
      const email = row.email?.trim();

      if (!fullName || !identificationNumber || !phone || !address || !email) {
        results.push({
          row: rowNumber,
          status: 'error',
          identificationNumber,
          reason: 'Faltan campos obligatorios (nombre, cédula/NIT, teléfono, dirección o correo)',
        });
        continue;
      }
      if (!EMAIL_RE.test(email)) {
        results.push({ row: rowNumber, status: 'error', identificationNumber, reason: 'Correo inválido' });
        continue;
      }
      if (seenInFile.has(identificationNumber)) {
        results.push({ row: rowNumber, status: 'skipped', identificationNumber, reason: 'Repetido dentro del archivo' });
        continue;
      }
      seenInFile.add(identificationNumber);

      const existing = await this.prisma.customer.findFirst({
        where: { tenantId: currentUser.tenantId, identificationNumber },
        select: { id: true },
      });
      if (existing) {
        results.push({ row: rowNumber, status: 'skipped', identificationNumber, reason: 'Ya existe un cliente con esa cédula/NIT' });
        continue;
      }

      const type = row.type?.trim() === 'Company' ? CustomerType.Company : CustomerType.Individual;
      try {
        await this.prisma.customer.create({
          data: { tenantId: currentUser.tenantId, type, fullName, identificationNumber, phone, address, email },
        });
        results.push({ row: rowNumber, status: 'created', identificationNumber });
      } catch (err) {
        results.push({
          row: rowNumber,
          status: 'error',
          identificationNumber,
          reason: err instanceof Error ? err.message : 'Error desconocido al crear el cliente',
        });
      }
    }

    return results;
  }

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.customer.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { references: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { documents: true, contracts: true, references: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  async setFlagged(id: string, flagged: boolean, currentUser: AuthenticatedUser) {
    await this.findOne(id, currentUser);
    return this.prisma.customer.update({ where: { id }, data: { flagged } });
  }
}
