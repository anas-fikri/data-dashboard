-- T-036 (ADR-0008): model segmen + manifest versi. Data lama dimigrasikan tanpa menyalin objek:
--   * SheetLineage: satu per (dataset, akar nama sheet = aliasName atau name, tanpa beda kapital/spasi
--     ujung); sheet dengan akar sama di versi yang sama dibedakan urutannya. rowHighWater 2^31 − 1:
--     typed lama ber-`_row INTEGER` (= baris fisik), jadi segmen baru tidak pernah memakai `_row`-nya.
--   * Segment legacy: tepat satu per Sheet (rowBase 0) yang merujuk rawKey lamanya.
--   * SegmentTyped (legacyRow) + SheetSegment ordinal 0: untuk sheet yang sudah punya typedKey.
-- Id deterministik (md5 → 'c' + 24 heks, bentuk cuid): migrasi bisa diperiksa ulang, tanpa ekstensi.

-- CreateTable
CREATE TABLE "SheetLineage" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rowHighWater" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "rowBase" BIGINT NOT NULL DEFAULT 0,
    "maxSrcRow" INTEGER,
    "rawKey" TEXT NOT NULL,
    "rawRows" INTEGER NOT NULL,
    "headerRow" INTEGER NOT NULL,
    "colCount" INTEGER NOT NULL,
    "createdByVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentTyped" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "schemaRevision" INTEGER NOT NULL,
    "typedKey" TEXT NOT NULL,
    "legacyRow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentTyped_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSegment" (
    "sheetId" TEXT NOT NULL,
    "segmentTypedId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "SheetSegment_pkey" PRIMARY KEY ("sheetId","ordinal")
);

-- AlterTable (diisi di bawah, lalu NOT NULL)
ALTER TABLE "Sheet" ADD COLUMN "lineageId" TEXT;

-- Backfill: kunci silsilah per sheet.
CREATE TEMP TABLE t036_sheet_root ON COMMIT DROP AS
SELECT s.id AS "sheetId",
       v."datasetId",
       lower(btrim(coalesce(nullif(btrim(s."aliasName"), ''), s.name)))
         || CASE WHEN row_number() OVER (
                   PARTITION BY s."versionId", lower(btrim(coalesce(nullif(btrim(s."aliasName"), ''), s.name)))
                   ORDER BY s."index") > 1
                 THEN '#' || row_number() OVER (
                   PARTITION BY s."versionId", lower(btrim(coalesce(nullif(btrim(s."aliasName"), ''), s.name)))
                   ORDER BY s."index")::text
                 ELSE '' END AS root
FROM "Sheet" s
JOIN "DatasetVersion" v ON v.id = s."versionId";

INSERT INTO "SheetLineage" ("id", "datasetId", "rowHighWater", "createdAt")
SELECT DISTINCT 'c' || substr(md5('lineage:' || r."datasetId" || ':' || r.root), 1, 24),
       r."datasetId", 2147483647, CURRENT_TIMESTAMP
FROM t036_sheet_root r;

UPDATE "Sheet" s
SET "lineageId" = 'c' || substr(md5('lineage:' || r."datasetId" || ':' || r.root), 1, 24)
FROM t036_sheet_root r
WHERE r."sheetId" = s.id;

INSERT INTO "Segment" ("id", "datasetId", "lineageId", "rowBase", "maxSrcRow", "rawKey", "rawRows",
                       "headerRow", "colCount", "createdByVersionId", "createdAt")
SELECT 'c' || substr(md5('segment:' || s.id), 1, 24), v."datasetId", s."lineageId", 0, NULL,
       s."rawKey", s."rawRows", s."headerRow", s."colCount", s."versionId", s."createdAt"
FROM "Sheet" s
JOIN "DatasetVersion" v ON v.id = s."versionId";

INSERT INTO "SegmentTyped" ("id", "segmentId", "schemaRevision", "typedKey", "legacyRow", "createdAt")
SELECT 'c' || substr(md5('typed:' || s.id), 1, 24), 'c' || substr(md5('segment:' || s.id), 1, 24),
       s."schemaRevision", s."typedKey", true, CURRENT_TIMESTAMP
FROM "Sheet" s
WHERE s."typedKey" IS NOT NULL;

INSERT INTO "SheetSegment" ("sheetId", "segmentTypedId", "ordinal")
SELECT s.id, 'c' || substr(md5('typed:' || s.id), 1, 24), 0
FROM "Sheet" s
WHERE s."typedKey" IS NOT NULL;

ALTER TABLE "Sheet" ALTER COLUMN "lineageId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "SheetLineage_datasetId_idx" ON "SheetLineage"("datasetId");

-- CreateIndex
CREATE INDEX "Segment_datasetId_idx" ON "Segment"("datasetId");

-- CreateIndex
CREATE INDEX "Segment_lineageId_idx" ON "Segment"("lineageId");

-- CreateIndex
CREATE INDEX "Segment_createdByVersionId_idx" ON "Segment"("createdByVersionId");

-- CreateIndex
CREATE INDEX "SegmentTyped_segmentId_idx" ON "SegmentTyped"("segmentId");

-- CreateIndex
CREATE INDEX "SheetSegment_segmentTypedId_idx" ON "SheetSegment"("segmentTypedId");

-- CreateIndex
CREATE INDEX "Sheet_lineageId_idx" ON "Sheet"("lineageId");

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "SheetLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetLineage" ADD CONSTRAINT "SheetLineage_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "SheetLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_createdByVersionId_fkey" FOREIGN KEY ("createdByVersionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentTyped" ADD CONSTRAINT "SegmentTyped_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSegment" ADD CONSTRAINT "SheetSegment_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSegment" ADD CONSTRAINT "SheetSegment_segmentTypedId_fkey" FOREIGN KEY ("segmentTypedId") REFERENCES "SegmentTyped"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
