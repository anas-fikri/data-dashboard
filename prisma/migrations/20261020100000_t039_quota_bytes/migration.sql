-- T-039: kuota dari byte yang benar-benar tersimpan. Ukuran file segmen dicatat saat ditulis; segmen
-- lama diukur pemeriksaan malam (HEAD). Waktu migrasi ini diterapkan = awal masa transisi makna kuota
-- (QUOTA_GRACE_DAYS, dibaca dari _prisma_migrations).

ALTER TABLE "Segment" ADD COLUMN "rawBytes" BIGINT;
ALTER TABLE "SegmentTyped" ADD COLUMN "typedBytes" BIGINT;
