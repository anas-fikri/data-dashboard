-- T-040: profil raw per file typed segmen (hitungan per kolom, lihat src/features/ingest/profile.ts).
-- Recast per segmen memakai gabungan profil semua segmen untuk memutuskan tipe tanpa memindai ulang
-- raw; null = file lama (dihitung saat recast pertama).

ALTER TABLE "SegmentTyped" ADD COLUMN "profile" JSONB;
