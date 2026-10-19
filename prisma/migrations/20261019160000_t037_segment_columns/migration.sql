-- T-037 (ADR-0008): posisi kolom c<pos> per file typed segmen, untuk proyeksi eksplisit saat segmen satu
-- sheet berbeda set kolom. Backfill dari skema sheet yang merujuk file itu di manifest (typed ditulis
-- dengan semua kolom skema, termasuk kolom kosong/absent T-014).

-- AlterTable
ALTER TABLE "SegmentTyped" ADD COLUMN "columns" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

UPDATE "SegmentTyped" t
SET "columns" = sub.cols
FROM (
  SELECT m."segmentTypedId" AS id,
         array_agg(DISTINCT (e->>'pos')::int ORDER BY (e->>'pos')::int) AS cols
  FROM "SheetSegment" m
  JOIN "Sheet" s ON s.id = m."sheetId"
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s."schema") = 'array' THEN s."schema" ELSE '[]'::jsonb END
  ) e
  WHERE (e->>'pos') ~ '^[0-9]+$'
  GROUP BY m."segmentTypedId"
) sub
WHERE sub.id = t.id;
