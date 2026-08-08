-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Cash', 'Transfer', 'Card', 'Other');

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'Cash';

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

