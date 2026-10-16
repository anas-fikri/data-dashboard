-- CreateTable
CREATE TABLE "GuideRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideRead_articleId_idx" ON "GuideRead"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideRead_userId_articleId_key" ON "GuideRead"("userId", "articleId");

-- AddForeignKey
ALTER TABLE "GuideRead" ADD CONSTRAINT "GuideRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideRead" ADD CONSTRAINT "GuideRead_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "GuideArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
