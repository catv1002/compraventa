-- Simplifica UserRole a 3 roles: Admin, BranchManager, SalesAdvisor.
-- Mapeo de roles retirados hacia los que quedan, antes de recrear el enum:
--   Cashier, Appraiser, Technician -> SalesAdvisor (roles de mostrador)
--   CollectionsAgent               -> BranchManager (cartera sigue vedada al vendedor)
--   Accountant, Auditor            -> Admin (funciones sensibles/financieras)

CREATE TYPE "UserRole_new" AS ENUM ('SalesAdvisor', 'BranchManager', 'Admin');

ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'Cashier' THEN 'SalesAdvisor'
    WHEN 'Appraiser' THEN 'SalesAdvisor'
    WHEN 'Technician' THEN 'SalesAdvisor'
    WHEN 'CollectionsAgent' THEN 'BranchManager'
    WHEN 'Accountant' THEN 'Admin'
    WHEN 'Auditor' THEN 'Admin'
    ELSE "role"::text
  END
)::"UserRole_new";

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
