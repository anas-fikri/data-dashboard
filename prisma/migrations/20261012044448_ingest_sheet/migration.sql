-- AlterTable
ALTER TABLE "DatasetVersion" ADD COLUMN     "ingestStage" TEXT,
ADD COLUMN     "ingestStartedAt" TIMESTAMP(3),
ADD COLUMN     "progress" JSONB;

-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rawKey" TEXT NOT NULL,
    "rawRows" INTEGER NOT NULL,
    "colCount" INTEGER NOT NULL,
    "headerRow" INTEGER NOT NULL,
    "columns" JSONB NOT NULL,
    "truncatedCells" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sheet_versionId_index_key" ON "Sheet"("versionId", "index");

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
