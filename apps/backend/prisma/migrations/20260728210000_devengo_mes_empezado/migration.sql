-- CV-029 · Devengo por mes EMPEZADO (docs/11 RN-16, docs/12 §3.11b)
--
-- Qué cambia y por qué: las capturas del sistema legado mostraron que el negocio
-- cobra todo mes empezado, no todo mes cumplido — con 1 mes y 25 días de mora
-- cobra 2 meses. La política anterior (`FullMonth`) cotiza exactamente la mitad
-- sobre los dos contratos reales observados. Se añade `FullMonthCeil` y pasa a
-- ser el default.
--
-- Por qué se recrea el tipo en vez de usar `ALTER TYPE ... ADD VALUE`: PostgreSQL
-- no permite USAR un valor de enum recién agregado dentro de la misma
-- transacción, y aquí lo necesitamos de inmediato para el DEFAULT. Recrear el
-- tipo deja la migración atómica.

-- AlterEnum
ALTER TYPE "InterestAccrualPolicy" RENAME TO "InterestAccrualPolicy_old";
CREATE TYPE "InterestAccrualPolicy" AS ENUM ('FullMonthCeil', 'FullMonth', 'ProRata');

ALTER TABLE "tenant_configurations"
  ALTER COLUMN "interestAccrualPolicy" DROP DEFAULT;

ALTER TABLE "tenant_configurations"
  ALTER COLUMN "interestAccrualPolicy" TYPE "InterestAccrualPolicy"
  USING ("interestAccrualPolicy"::text::"InterestAccrualPolicy");

ALTER TABLE "tenant_configurations"
  ALTER COLUMN "interestAccrualPolicy" SET DEFAULT 'FullMonthCeil';

DROP TYPE "InterestAccrualPolicy_old";

-- Backfill: las configuraciones existentes se crearon con el default anterior,
-- que no era una decisión del negocio sino el único valor disponible. Dejarlas
-- en `FullMonth` significaría seguir cobrando la mitad. Un tenant que
-- deliberadamente quiera la política conservadora la vuelve a poner desde
-- configuración (CV-021).
UPDATE "tenant_configurations"
SET "interestAccrualPolicy" = 'FullMonthCeil'
WHERE "interestAccrualPolicy" = 'FullMonth';
