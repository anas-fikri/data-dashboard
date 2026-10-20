# Knowledge: quota

- Status FAILED tidak cukup untuk tahu apakah objek sumber masih ada: tandai dengan fakta yang hanya ditulis saat objek lengkap tersimpan (etag pada peralihan UPLOADED), bukan stempel waktu yang juga diisi jalur tolak; dan migrasi makna kuota paling aman dengan masa transisi yang berpatokan pada waktu migrasi itu sendiri (_prisma_migrations.finished_at) tanpa konfigurasi tanggal manual. <!-- aitk:k date=2026-10-19 task=T-039 tags=quota,security,migration -->
