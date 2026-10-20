-- T-059: antrean unggah banyak file periode. Aditif (tabel + enum baru); rollback: DROP TABLE
-- "UploadQueueItem", "UploadQueue"; DROP TYPE "UploadQueueItemState", "UploadQueueStatus".
-- CreateEnum
CREATE TYPE "UploadQueueStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UploadQueueItemState" AS ENUM ('WAITING', 'UPLOADING', 'QUEUED', 'STARTED', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "UploadQueue" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" "UploadQueueStatus" NOT NULL DEFAULT 'OPEN',
    "stoppedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadQueueItem" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "versionId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "lastModified" BIGINT NOT NULL,
    "periodLabel" DATE,
    "uploadId" TEXT,
    "partSize" INTEGER NOT NULL,
    "partCount" INTEGER NOT NULL,
    "etag" TEXT,
    "completingAt" TIMESTAMP(3),
    "state" "UploadQueueItemState" NOT NULL DEFAULT 'WAITING',
    "message" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadQueue_datasetId_createdAt_idx" ON "UploadQueue"("datasetId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadQueue_status_idx" ON "UploadQueue"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UploadQueueItem_versionId_key" ON "UploadQueueItem"("versionId");

-- CreateIndex
CREATE INDEX "UploadQueueItem_state_updatedAt_idx" ON "UploadQueueItem"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadQueueItem_queueId_seq_key" ON "UploadQueueItem"("queueId", "seq");

-- AddForeignKey
ALTER TABLE "UploadQueue" ADD CONSTRAINT "UploadQueue_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadQueueItem" ADD CONSTRAINT "UploadQueueItem_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "UploadQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Paling banyak satu antrean OPEN per dataset (giliran file berurutan, D4).
-- Indeks parsial tidak bisa ditulis di schema.prisma: JANGAN dihapus oleh migrasi hasil
-- `prisma migrate dev` berikutnya (drift "UploadQueue_datasetId_open_key" harus dipertahankan; dijaga
-- tests/features/uploads/queue-migration.test.ts).
CREATE UNIQUE INDEX "UploadQueue_datasetId_open_key" ON "UploadQueue"("datasetId") WHERE "status" = 'OPEN';
