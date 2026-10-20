-- T-052: unggahan periode (rencana G-6 §4.5). Aditif; rollback: DROP COLUMN keduanya (selama belum ada
-- versi ber-mode PERIOD yang belum terminal).
-- baseVersionId: versi aktif yang dilihat pemilik saat init (bukan FK: versi dasar boleh dibuang retensi).
-- periodLabel: awal periode pilihan pemilik untuk sheet bersumber label (naive, D8).
ALTER TABLE "DatasetVersion" ADD COLUMN "baseVersionId" TEXT;
ALTER TABLE "DatasetVersion" ADD COLUMN "periodLabel" DATE;
