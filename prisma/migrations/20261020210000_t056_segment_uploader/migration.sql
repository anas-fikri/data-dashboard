-- T-056: pengunggah file asal segmen (kartu Periode "Diunggah oleh"), bertahan walau versi pembuatnya
-- dibuang retensi. Aditif; rollback: DROP COLUMN "uploadedById" (beserta FK-nya).
ALTER TABLE "Segment" ADD COLUMN "uploadedById" TEXT;

ALTER TABLE "Segment" ADD CONSTRAINT "Segment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Isi dari versi pembuat yang masih ada (segmen yang versinya sudah dibuang tetap null = tidak diketahui).
UPDATE "Segment" s
SET "uploadedById" = v."uploadedById"
FROM "DatasetVersion" v
WHERE s."createdByVersionId" = v.id AND s."uploadedById" IS NULL AND v."uploadedById" IS NOT NULL;
