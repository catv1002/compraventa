-- AlterTable
ALTER TABLE "contract_movements" ADD COLUMN     "lostReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lostReceiptVerifiedId" TEXT;
