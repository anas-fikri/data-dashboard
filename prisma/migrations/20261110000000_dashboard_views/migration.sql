-- Tampilan tersimpan dashboard (T-tf88, v1.14.0): tabel baru, tanpa mengubah data lama (aman untuk rollback image).
-- CreateTable
CREATE TABLE "DashboardView" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardView_dashboardId_idx" ON "DashboardView"("dashboardId");

-- CreateIndex
CREATE INDEX "DashboardView_userId_idx" ON "DashboardView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardView_dashboardId_userId_nameKey_key" ON "DashboardView"("dashboardId", "userId", "nameKey");

-- AddForeignKey
ALTER TABLE "DashboardView" ADD CONSTRAINT "DashboardView_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardView" ADD CONSTRAINT "DashboardView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

