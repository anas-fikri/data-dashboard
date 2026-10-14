-- AlterTable
ALTER TABLE "DatasetVersion" ADD COLUMN     "sourceDeletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StorageCleanup" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "missingColumns" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "StorageCleanup_notBefore_idx" ON "StorageCleanup"("notBefore");
