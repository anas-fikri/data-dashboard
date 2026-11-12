-- T-rbrb (v1.20, ADR-0011): unggahan periode Tambah / Perbarui berdasarkan kunci. Kolom baru ber-bawaan
-- kosong/NULL: versi lama dan rollback image tidak terpengaruh (kolom diabaikan, unggahan = Ganti).
CREATE TYPE "PeriodUploadMode" AS ENUM ('REPLACE', 'APPEND', 'UPSERT');
ALTER TABLE "SheetLineage" ADD COLUMN "keyColumns" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "DatasetVersion" ADD COLUMN "uploadMode" "PeriodUploadMode";
ALTER TABLE "UploadQueue" ADD COLUMN "uploadMode" "PeriodUploadMode";
