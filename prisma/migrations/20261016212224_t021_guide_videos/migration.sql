-- CreateEnum
CREATE TYPE "GuideVideoStatus" AS ENUM ('UPLOADING', 'READY');

-- CreateTable
CREATE TABLE "GuideVideo" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "uploadId" TEXT,
    "posterKey" TEXT,
    "durationSec" INTEGER,
    "status" "GuideVideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideVideo_objectKey_key" ON "GuideVideo"("objectKey");

-- CreateIndex
CREATE INDEX "GuideVideo_articleId_status_idx" ON "GuideVideo"("articleId", "status");

-- AddForeignKey
ALTER TABLE "GuideVideo" ADD CONSTRAINT "GuideVideo_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "GuideArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
