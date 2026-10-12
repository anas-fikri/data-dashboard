-- AlterTable
ALTER TABLE "Dashboard" ADD COLUMN     "layoutRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nameKey" TEXT NOT NULL;

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
