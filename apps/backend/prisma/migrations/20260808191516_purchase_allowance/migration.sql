-- CreateTable
CREATE TABLE "purchase_allowances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assignedAmount" DECIMAL(14,2) NOT NULL,
    "spentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_allowances_tenantId_branchId_date_idx" ON "purchase_allowances"("tenantId", "branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_allowances_userId_date_key" ON "purchase_allowances"("userId", "date");

-- AddForeignKey
ALTER TABLE "purchase_allowances" ADD CONSTRAINT "purchase_allowances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_allowances" ADD CONSTRAINT "purchase_allowances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_allowances" ADD CONSTRAINT "purchase_allowances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_allowances" ADD CONSTRAINT "purchase_allowances_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
