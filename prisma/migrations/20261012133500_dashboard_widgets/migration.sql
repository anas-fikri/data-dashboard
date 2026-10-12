-- AlterTable: nameKey ditambahkan nullable dulu agar dashboard yang sudah ada bisa diisi.
ALTER TABLE "Dashboard" ADD COLUMN     "layoutRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nameKey" TEXT;

-- Backfill: sama dengan nameKeyOf (trim, spasi dirapatkan, huruf kecil).
UPDATE "Dashboard" SET "nameKey" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'));

-- Nama kembar lama di dataset yang sama: akhiran " (2)", " (3)", … agar indeks unik bisa dibuat.
WITH dup AS (
  SELECT "id", row_number() OVER (PARTITION BY "datasetId", "nameKey" ORDER BY "createdAt", "id") AS n
  FROM "Dashboard"
)
UPDATE "Dashboard" AS d
SET "name" = d."name" || ' (' || dup.n || ')',
    "nameKey" = d."nameKey" || ' (' || dup.n || ')'
FROM dup
WHERE d."id" = dup."id" AND dup.n > 1;

ALTER TABLE "Dashboard" ALTER COLUMN "nameKey" SET NOT NULL;

-- CreateTable
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'empty',
    "title" TEXT NOT NULL DEFAULT '',
    "spec" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Widget_dashboardId_idx" ON "Widget"("dashboardId");

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_datasetId_nameKey_key" ON "Dashboard"("datasetId", "nameKey");

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
