import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CHART_OF_ACCOUNTS } from '../src/modules/accounting/chart-of-accounts';
import {
  GOLD_ATTRIBUTE_SCHEMA,
  GOLD_CATEGORY_SEED_ID,
  JEWELRY_CLASSES,
  jewelryClassSeedId,
} from '../src/modules/inventory/jewelry-catalog';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { taxId: '900000000-1' },
    update: {},
    create: { legalName: 'Compraventa Demo S.A.S.', taxId: '900000000-1' },
  });

  await prisma.tenantConfiguration.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-main' },
    update: {},
    create: { id: 'seed-branch-main', tenantId: tenant.id, name: 'Sede Principal', address: 'Bogotá' },
  });

  const passwordHash = await bcrypt.hash('admin1234', 10);
  await prisma.user.upsert({
    where: { email: 'admin@compraventa.demo' },
    update: {},
    create: {
      tenantId: tenant.id,
      homeBranchId: branch.id,
      email: 'admin@compraventa.demo',
      passwordHash,
      fullName: 'Administrador Demo',
      role: UserRole.Admin,
    },
  });

  // Línea de negocio "Oro": es el único dueño del esquema de atributos (peso
  // obligatorio + quilataje con 18k por defecto) y el padre de las 15 clases de
  // joya. Ver la decisión de modelado documentada en
  // `src/modules/inventory/jewelry-catalog.ts`.
  //
  // A diferencia del resto del seed, aquí sí se hace `update`: el esquema es
  // código versionado, no un dato que el operador edite, y una base sembrada con
  // la versión anterior (que declaraba `karats` como número y sin rótulos) debe
  // converger al ejecutar el seed de nuevo.
  const goldSchema = GOLD_ATTRIBUTE_SCHEMA as unknown as Prisma.InputJsonValue;
  await prisma.category.upsert({
    where: { id: GOLD_CATEGORY_SEED_ID },
    update: { attributeSchema: goldSchema },
    create: {
      id: GOLD_CATEGORY_SEED_ID,
      tenantId: tenant.id,
      name: 'Oro',
      attributeSchema: goldSchema,
    },
  });

  // Catálogo cerrado de clases de joya (RN-20, CV-020). El operador las elige de
  // una lista; antes escribía la clase a mano y "GARGANTILLA", "gargantilla" y
  // "garg." eran tres cosas distintas. Cada clase conserva su código del legado
  // en `attributeSchema.legacyCode` para poder emparejar el histórico (CV-024) y
  // hereda de "Oro" el peso y el quilataje, así que su esquema propio va vacío.
  for (const jewelryClass of JEWELRY_CLASSES) {
    const attributeSchema = { legacyCode: jewelryClass.code, attributes: [] };
    await prisma.category.upsert({
      where: { id: jewelryClassSeedId(jewelryClass.code) },
      update: { name: jewelryClass.name, attributeSchema },
      create: {
        id: jewelryClassSeedId(jewelryClass.code),
        tenantId: tenant.id,
        parentCategoryId: GOLD_CATEGORY_SEED_ID,
        name: jewelryClass.name,
        attributeSchema,
      },
    });
  }

  for (const account of CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: account.code } },
      update: {},
      create: { tenantId: tenant.id, code: account.code, name: account.name, type: account.type },
    });
  }

  console.log(
    `Seed completo. Usuario: admin@compraventa.demo / admin1234 · ` +
      `${JEWELRY_CLASSES.length} clases de joya bajo "Oro".`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
