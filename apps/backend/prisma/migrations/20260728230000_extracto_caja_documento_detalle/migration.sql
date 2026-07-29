-- Libro de caja con saldo corrido: documento, detalle y orden de asiento.
-- Ver docs/12-gap-analysis-y-backlog.md §3.11e (CV-032) y la pantalla C-07 de
-- docs/fuentes/2026-07-capturas-plus-cv-carrera113.md.
--
-- Escrita a mano en vez de generada porque `detail` es una columna requerida
-- sobre una tabla que ya tiene datos: se agrega nullable, se rellena, y solo
-- entonces se marca NOT NULL. Mismo procedimiento que
-- 20260728120000_empeno_intereses_consecutivo.

-- AlterTable: columnas del asiento, todavía nullables para poder rellenar
ALTER TABLE "cash_movements" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "detail" TEXT;

-- AlterTable: orden de asiento. SERIAL (no una columna calculada) porque el
-- desempate tiene que sobrevivir a dos asientos escritos en la misma
-- transacción y por tanto con el mismo `createdAt` — capital y retroventa de
-- una liquidación (RN-26). Postgres rellena las filas existentes en orden
-- físico, que para una tabla nunca actualizada es el orden de inserción.
ALTER TABLE "cash_movements" ADD COLUMN     "seq" SERIAL;

-- Backfill 1: el documento visible de un asiento nacido de un contrato es el
-- consecutivo de negocio de ese contrato, igual que en la columna "Documento"
-- del extracto legado.
UPDATE "cash_movements" m
SET "documentNumber" = c."contractNumber"::TEXT
FROM "contracts" c
WHERE m."contractId" = c."id" AND m."documentNumber" IS NULL;

-- Backfill 2: el detalle histórico NO se puede reconstruir. `sourceType` vale
-- 'Contract' en todos los movimientos escritos hasta hoy, así que no distingue
-- un desembolso de un abono ni de una liquidación. Antes que inventar
-- terminología legal que nadie escribió, se marca explícitamente el asiento
-- como migrado: una fila que dice "no sé qué concepto fue" es auditable; una
-- que afirma "CAPITAL LIQUIDACION" sin evidencia, no.
UPDATE "cash_movements"
SET "detail" = CASE
  WHEN "documentNumber" IS NOT NULL THEN 'MOVIMIENTO MIGRADO DEL CONTRATO # ' || "documentNumber"
  ELSE 'MOVIMIENTO MIGRADO'
END
WHERE "detail" IS NULL;

-- Ahora sí: requerida
ALTER TABLE "cash_movements" ALTER COLUMN "detail" SET NOT NULL;

-- CreateIndex: el extracto siempre se lee por caja y en orden cronológico, y el
-- saldo corrido obliga a recorrer todas las filas del rango.
CREATE INDEX "cash_movements_cashRegisterId_createdAt_seq_idx" ON "cash_movements"("cashRegisterId", "createdAt", "seq");
