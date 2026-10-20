-- T-051: pengaturan periode dataset (rencana G-6 §4.3, §5.2). Aditif; rollback: DROP COLUMN + DROP TYPE.
-- keepPeriods null = bawaan admin (PERIOD_KEEP_DEFAULT); batas atas PERIOD_KEEP_MAX ditegakkan aplikasi
-- (env bisa berubah), di sini hanya ≥ 1.
CREATE TYPE "PeriodOnLimit" AS ENUM ('REJECT', 'EVICT_OLDEST');
ALTER TABLE "Dataset" ADD COLUMN "keepPeriods" INTEGER;
ALTER TABLE "Dataset" ADD COLUMN "onLimit" "PeriodOnLimit" NOT NULL DEFAULT 'REJECT';
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_keepPeriods_check" CHECK ("keepPeriods" IS NULL OR "keepPeriods" >= 1);
