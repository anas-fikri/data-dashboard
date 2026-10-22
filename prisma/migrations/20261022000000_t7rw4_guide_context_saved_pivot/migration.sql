-- T-7rw4: konteks Bantuan baru untuk halaman pivot tersimpan (+ halaman dataset). Aditif: hanya menambah
-- nilai enum (metadata katalog, tanpa tulis ulang tabel). Rollback: image lama tidak mengenal nilai ini,
-- jadi artikel dengan konteks SAVED_PIVOT harus dikosongkan dulu
-- (UPDATE "GuideArticle" SET "contextKey" = NULL WHERE "contextKey" = 'SAVED_PIVOT') atau pakai dump
-- pra-upgrade (`upgrade.sh rollback`). Nilai enum tidak perlu dihapus.
ALTER TYPE "GuideContext" ADD VALUE 'SAVED_PIVOT';
