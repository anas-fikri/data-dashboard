-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "pendingName" TEXT;

-- CreateIndex
CREATE INDEX "User_emailVerifiedAt_createdAt_idx" ON "User"("emailVerifiedAt", "createdAt");
