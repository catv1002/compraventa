-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "saleTicketId" TEXT;

-- CreateIndex
CREATE INDEX "contracts_saleTicketId_idx" ON "contracts"("saleTicketId");

