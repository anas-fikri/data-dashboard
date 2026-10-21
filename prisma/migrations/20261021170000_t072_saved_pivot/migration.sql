-- T-072 (ADR-0009): pivot tersimpan per dataset + Widget.savedPivotId. Aditif dan aman di PG14 produksi:
-- tabel baru kosong; kolom Widget nullable tanpa default (hanya metadata, tanpa tulis ulang tabel); indeks
-- dan FK pada tabel Widget kecil (semua NULL → validasi FK instan). Widget lama tidak diubah.
-- Rollback (runbook §7 R): image prev + database dari dump pra-upgrade (`upgrade.sh rollback`, SavedPivot
-- termasuk NEW_TABLES). Manual tanpa dump: DROP CONSTRAINT "Widget_savedPivotId_fkey"; DROP INDEX
-- "Widget_savedPivotId_idx"; ALTER TABLE "Widget" DROP COLUMN "savedPivotId"; DROP TABLE "SavedPivot";
-- lalu hapus baris migrasi ini dari _prisma_migrations — pivot tersimpan yang dibuat sesudahnya hilang.

-- CreateTable
CREATE TABLE "SavedPivot" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "missingColumns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPivot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedPivot_datasetId_nameKey_key" ON "SavedPivot"("datasetId", "nameKey");

-- AddForeignKey
ALTER TABLE "SavedPivot" ADD CONSTRAINT "SavedPivot_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPivot" ADD CONSTRAINT "SavedPivot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "savedPivotId" TEXT;

-- CreateIndex
CREATE INDEX "Widget_savedPivotId_idx" ON "Widget"("savedPivotId");

-- AddForeignKey
-- NO ACTION (bukan RESTRICT): diperiksa di akhir statement, sehingga hapus dataset yang meng-cascade
-- Dashboard → Widget dan SavedPivot dalam satu statement tidak gagal.
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_savedPivotId_fkey" FOREIGN KEY ("savedPivotId") REFERENCES "SavedPivot"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
