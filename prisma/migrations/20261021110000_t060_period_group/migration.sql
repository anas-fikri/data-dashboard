-- T-060: satu periode dari beberapa file sebagai satu kelompok. Aditif (kolom nullable/default);
-- rollback: DROP COLUMN "groupId", "groupPart", "groupSize" (Segment), "groupFiles" (DatasetVersion),
-- "grouped", "groupVersionId" (UploadQueue) — hanya aman bila tidak ada segmen kelompok di manifest hidup.
-- AlterTable
ALTER TABLE "Segment" ADD COLUMN "groupId" TEXT,
ADD COLUMN "groupPart" INTEGER,
ADD COLUMN "groupSize" INTEGER;

-- AlterTable
ALTER TABLE "DatasetVersion" ADD COLUMN "groupFiles" JSONB;

-- AlterTable
ALTER TABLE "UploadQueue" ADD COLUMN "grouped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "groupVersionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UploadQueue_groupVersionId_key" ON "UploadQueue"("groupVersionId");
