-- T-057: fakta unggahan periode (sheet yang diabaikan + perubahan skema sheet dari pemetaan/kolom baru).
ALTER TABLE "DatasetVersion" ADD COLUMN "periodMeta" JSONB;
