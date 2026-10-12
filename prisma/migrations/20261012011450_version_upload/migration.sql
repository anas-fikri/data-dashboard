-- AlterTable
ALTER TABLE "DatasetVersion" ADD COLUMN     "completingAt" TIMESTAMP(3),
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "partCount" INTEGER,
ADD COLUMN     "partSize" INTEGER,
ADD COLUMN     "uploadId" TEXT,
ADD COLUMN     "uploadedById" TEXT;

-- CreateIndex
CREATE INDEX "DatasetVersion_datasetId_status_idx" ON "DatasetVersion"("datasetId", "status");

-- CreateIndex
CREATE INDEX "DatasetVersion_uploadedById_status_idx" ON "DatasetVersion"("uploadedById", "status");

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
