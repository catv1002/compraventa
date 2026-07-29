-- Motor de intereses, consecutivo de contrato y parámetros del ciclo de empeño.
-- Ver docs/12-gap-analysis-y-backlog.md §0 (CV-002, CV-008, CV-015, CV-021).
--
-- Escrita a mano en vez de generada porque `branchId` y `contractNumber` son
-- columnas requeridas sobre una tabla que ya tiene datos: se agregan como
-- nullables, se rellenan, y solo entonces se marcan NOT NULL.

-- CreateEnum
CREATE TYPE "InterestAccrualPolicy" AS ENUM ('FullMonth', 'ProRata');

-- CreateEnum
CREATE TYPE "InterestRounding" AS ENUM ('None', 'NearestPeso', 'NearestHundred');

-- CreateEnum
CREATE TYPE "UsuryCapPolicy" AS ENUM ('Block', 'Warn');

-- AlterTable: parámetros del ciclo de empeño
ALTER TABLE "tenant_configurations" ADD COLUMN     "contractNumberOffset" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defaultMonthlyInterestRate" DECIMAL(6,4) NOT NULL DEFAULT 0.0400,
ADD COLUMN     "defaultTermMonths" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "forfeitureThresholdMonths" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "interestAccrualPolicy" "InterestAccrualPolicy" NOT NULL DEFAULT 'FullMonth',
ADD COLUMN     "interestRounding" "InterestRounding" NOT NULL DEFAULT 'NearestHundred',
ADD COLUMN     "usuryCapPolicy" "UsuryCapPolicy" NOT NULL DEFAULT 'Warn';

-- AlterTable: columnas nuevas de contrato, todavía nullables para poder rellenar
ALTER TABLE "contracts" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "contractNumber" INTEGER,
ADD COLUMN     "interestAccrualStart" TIMESTAMP(3),
ADD COLUMN     "interestPaidThrough" TIMESTAMP(3);

-- Backfill 1: la sucursal del contrato es la del artículo que lo respalda; si
-- por algún motivo no la tuviera, se cae a la primera sucursal del tenant.
UPDATE "contracts" c
SET "branchId" = COALESCE(
  (SELECT i."branchId" FROM "items" i WHERE i."id" = c."itemId"),
  (SELECT b."id" FROM "branches" b WHERE b."tenantId" = c."tenantId" ORDER BY b."createdAt" ASC LIMIT 1)
)
WHERE c."branchId" IS NULL;

-- Backfill 2: consecutivo por sucursal en orden cronológico de creación, que es
-- el orden en que el negocio los habría numerado.
WITH numerados AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "branchId" ORDER BY "createdAt" ASC, "id" ASC) AS n
  FROM "contracts"
)
UPDATE "contracts" c
SET "contractNumber" = numerados.n
FROM numerados
WHERE c."id" = numerados."id" AND c."contractNumber" IS NULL;

-- Backfill 3: los contratos de empeño ya desembolsados devengan interés desde
-- su fecha de creación. Es una aproximación: el sistema anterior no registraba
-- la fecha de desembolso por separado. Para contratos nuevos sí se registra.
UPDATE "contracts"
SET "interestAccrualStart" = "createdAt"
WHERE "contractType" = 'Pawn'
  AND "status" IN ('Active', 'Renewed', 'Overdue')
  AND "interestAccrualStart" IS NULL;

-- Ahora sí: requeridas
ALTER TABLE "contracts" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "contracts" ALTER COLUMN "contractNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "contract_sequences" (
    "branchId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contract_sequences_pkey" PRIMARY KEY ("branchId")
);

-- Backfill 4: el contador arranca donde quedó la numeración existente, para que
-- el siguiente contrato no colisione con uno ya migrado.
INSERT INTO "contract_sequences" ("branchId", "lastNumber")
SELECT "branchId", MAX("contractNumber") FROM "contracts" GROUP BY "branchId";

-- CreateIndex
CREATE INDEX "contracts_tenantId_status_idx" ON "contracts"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_branchId_contractNumber_key" ON "contracts"("branchId", "contractNumber");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_sequences" ADD CONSTRAINT "contract_sequences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
