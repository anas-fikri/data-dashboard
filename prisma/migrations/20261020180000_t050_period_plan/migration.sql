-- T-050: rencana periode beku di versi (rencana G-6 §4.5 langkah 7). Aditif; rollback: DROP COLUMN.
ALTER TABLE "DatasetVersion" ADD COLUMN "plan" JSONB;
