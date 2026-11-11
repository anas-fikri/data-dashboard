-- T-0gmm (v1.16): gabungkan sheet berkolom sama saat unggah xlsx. Kolom baru ber-bawaan false: versi lama
-- dan rollback image tidak terpengaruh (kolom diabaikan).
ALTER TABLE "DatasetVersion" ADD COLUMN "mergeSheets" BOOLEAN NOT NULL DEFAULT false;
