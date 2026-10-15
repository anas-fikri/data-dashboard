-- CreateEnum
CREATE TYPE "DashboardRole" AS ENUM ('VIEWER', 'EDITOR');

-- AlterTable
ALTER TABLE "Dashboard" ADD COLUMN     "orgShared" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DashboardShare" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DashboardRole" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardShare_userId_idx" ON "DashboardShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardShare_dashboardId_userId_key" ON "DashboardShare"("dashboardId", "userId");

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
