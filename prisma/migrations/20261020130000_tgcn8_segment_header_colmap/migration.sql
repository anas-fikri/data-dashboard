-- T-gcn8: baris judul per file typed (segmen yang dibagi beberapa versi tidak lagi berbagi satu judul
-- yang bisa diubah) + peta kolom raw → posisi kanonik per segmen (unggahan periode, urutan kolom beda).

ALTER TABLE "Segment" ADD COLUMN "colMap" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "SegmentTyped" ADD COLUMN "headerRow" INTEGER;

-- File typed yang dirujuk manifest: judulnya = judul sheet yang merujuknya (sebelum T-gcn8 judul
-- dipilih ulang hanya untuk sheet satu segmen). Sisanya tetap null → Segment.headerRow.
UPDATE "SegmentTyped" t SET "headerRow" = s."headerRow"
  FROM "SheetSegment" m JOIN "Sheet" s ON s.id = m."sheetId"
  WHERE m."segmentTypedId" = t.id
    AND (SELECT count(*) FROM "SheetSegment" m2 WHERE m2."sheetId" = s.id) = 1;
