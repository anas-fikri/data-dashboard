-- CreateEnum
CREATE TYPE "GuideRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER', 'ADMIN', 'ALL');

-- CreateEnum
CREATE TYPE "GuideContext" AS ENUM ('UPLOAD', 'SCHEMA', 'BUILDER');

-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "GuideArticle" (
    "id" TEXT NOT NULL,
    "role" "GuideRole" NOT NULL,
    "contextKey" "GuideContext",
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "GuideStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideArticle_slug_key" ON "GuideArticle"("slug");

-- CreateIndex
CREATE INDEX "GuideArticle_status_role_order_idx" ON "GuideArticle"("status", "role", "order");
