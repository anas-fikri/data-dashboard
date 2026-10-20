-- T-049: model data periode (rencana G-6 §4.3). Aditif kecuali VersionMode (APPEND dihapus).
-- Pra-deploy: SELECT count(*) FROM "DatasetVersion" WHERE mode::text = 'APPEND';  -- harus 0
-- Rollback (sebelum ada data periode): lihat Notes T-049 (kolom/enum baru dibuang, APPEND dikembalikan).

-- 1. VersionMode: APPEND (T-015) tidak pernah ditulis kode. Bila ada barisnya, migrasi berhenti dengan
--    pesan (tidak ada cast diam-diam ke mode lain).
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "DatasetVersion" WHERE "mode"::text = 'APPEND';
  IF n > 0 THEN
    RAISE EXCEPTION 'T-049: % versi dataset ber-mode APPEND; mode ini dihapus. Periksa versi itu (SELECT id, "datasetId", status FROM "DatasetVersion" WHERE mode::text = ''APPEND'') dan putuskan (ubah ke REPLACE atau hapus) sebelum migrasi diulang.', n;
  END IF;
END $$;

CREATE TYPE "VersionMode_new" AS ENUM ('REPLACE', 'PERIOD', 'PERIOD_SETUP', 'PERIOD_REMOVE', 'PERIOD_RESTORE');
ALTER TABLE "DatasetVersion" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "DatasetVersion" ALTER COLUMN "mode" TYPE "VersionMode_new" USING ("mode"::text::"VersionMode_new");
ALTER TYPE "VersionMode" RENAME TO "VersionMode_old";
ALTER TYPE "VersionMode_new" RENAME TO "VersionMode";
DROP TYPE "VersionMode_old";
ALTER TABLE "DatasetVersion" ALTER COLUMN "mode" SET DEFAULT 'REPLACE';

-- 2. Status non-terminal baru (belum dipakai di migrasi ini, jadi aman di dalam transaksi PG ≥ 12).
ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CONFIRM' AFTER 'AWAITING_MAPPING';

-- 3. Mode periode milik versi + sheet (bukan dataset). Semua null = data lama tetap non-periode.
CREATE TYPE "PeriodGrain" AS ENUM ('MONTH', 'QUARTER', 'YEAR');
CREATE TYPE "PeriodSource" AS ENUM ('COLUMN', 'LABEL');
ALTER TABLE "DatasetVersion" ADD COLUMN "periodGrain" "PeriodGrain";
ALTER TABLE "Sheet" ADD COLUMN "periodSource" "PeriodSource",
                    ADD COLUMN "periodColumn" INTEGER;

-- 4. Metadata segmen.
ALTER TABLE "Segment" ADD COLUMN "periodKey" TEXT,
                      ADD COLUMN "periodStart" DATE,
                      ADD COLUMN "minDate" TIMESTAMP(6),
                      ADD COLUMN "maxDate" TIMESTAMP(6),
                      ADD COLUMN "sha256" TEXT,
                      ADD COLUMN "originalName" TEXT,
                      ADD COLUMN "sourceKind" TEXT;
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_period_pair_check"
  CHECK (("periodKey" IS NULL) = ("periodStart" IS NULL));
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_sourceKind_check"
  CHECK ("sourceKind" IS NULL OR "sourceKind" IN ('xlsx', 'csv'));

-- Isi dari versi pembuat (file asal segmen = file unggahan versi itu). Segmen yang versinya sudah
-- terhapus (createdByVersionId null) tetap null = tidak diketahui. periodKey/periodStart tetap null:
-- semua data lama non-periode.
UPDATE "Segment" g
   SET "sha256" = v."sha256",
       "originalName" = v."originalName",
       "sourceKind" = CASE
         WHEN v."sourceKey" IS NULL THEN NULL
         WHEN v."sourceKey" LIKE '%.csv' THEN 'csv'
         ELSE 'xlsx'
       END
  FROM "DatasetVersion" v
 WHERE v.id = g."createdByVersionId";
