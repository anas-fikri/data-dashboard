-- Template warna status per dashboard (v1.9.0). Kolom opsional: rollback aman (diabaikan versi lama).
ALTER TABLE "Dashboard" ADD COLUMN "colors" JSONB;
