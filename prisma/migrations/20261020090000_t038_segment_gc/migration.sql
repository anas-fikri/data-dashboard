-- T-038: GC segmen mark-and-sweep (ADR-0008). Segmen tidak lagi ikut terhapus bersama versi
-- pembuatnya (retensi): objeknya dihapus GC setelah tidak dirujuk versi hidup selama masa tenggang.
-- Tidak ada data yang dipindah atau dihapus oleh migrasi ini.

ALTER TABLE "Segment" DROP CONSTRAINT "Segment_createdByVersionId_fkey";
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_createdByVersionId_fkey" FOREIGN KEY ("createdByVersionId") REFERENCES "DatasetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Segment" ADD COLUMN "unreferencedAt" TIMESTAMP(3);
ALTER TABLE "SegmentTyped" ADD COLUMN "dataRows" INTEGER;
ALTER TABLE "SegmentTyped" ADD COLUMN "unreferencedAt" TIMESTAMP(3);
