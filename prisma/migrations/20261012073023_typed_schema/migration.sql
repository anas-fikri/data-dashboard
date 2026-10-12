-- AlterTable
ALTER TABLE "Sheet" ADD COLUMN     "schema" JSONB,
ADD COLUMN     "schemaRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "typedKey" TEXT;
