-- AlterTable
ALTER TABLE "tenant_configurations" ADD COLUMN     "withholdingTaxEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withholdingTaxMinBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withholdingTaxRate" DECIMAL(6,4) NOT NULL DEFAULT 0;

