-- CreateEnum
CREATE TYPE "MetalType" AS ENUM ('Gold', 'Silver', 'Platinum');

-- CreateTable
CREATE TABLE "metal_prices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metal" "MetalType" NOT NULL,
    "pricePerGramFine" DECIMAL(14,2) NOT NULL,
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metal_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metal_prices_tenantId_metal_createdAt_idx" ON "metal_prices"("tenantId", "metal", "createdAt");

-- AddForeignKey
ALTER TABLE "metal_prices" ADD CONSTRAINT "metal_prices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_prices" ADD CONSTRAINT "metal_prices_setById_fkey" FOREIGN KEY ("setById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

