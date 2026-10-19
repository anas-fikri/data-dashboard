# Data Dashboard

Pengganti dashboard Excel untuk PCP Express: upload xlsx/csv sampai 1 GB, rakit dashboard sendiri.
Acuan arsitektur dan alur: `docs/flow-kerja.md`. Task dan konvensi: `aitk brief`.
Programmer baru: mulai dari `docs/panduan-developer.md` (peta kode, resep modifikasi, tes, rilis). Ringkasan
proyek untuk manajemen/operator: `docs/ringkasan-dokumentasi.md` (PDF: `docs/ringkasan-dokumentasi.pdf`, buat ulang
dengan `node scripts/md-to-pdf.mjs docs/ringkasan-dokumentasi.md`).

## Menjalankan lokal

Prasyarat: Node ≥ 22.9 (`.nvmrc` = 22), Docker Desktop.

```bash
npm ci
npm run secrets:dev        # buat .env dengan secret acak dari .env.example
npm run compose:up         # PostgreSQL, Redis, RustFS (S3) + init bucket/CORS/lifecycle, Mailpit
npm run db:migrate         # migrasi Prisma (dev)
npm run db:seed            # admin pertama dari SEED_ADMIN_EMAIL
npm run dev                # http://localhost:3100 — cek http://localhost:3100/health
```

Mailpit UI: http://localhost:8026 · RustFS console: http://localhost:9101

## Verifikasi

```bash
npm run check      # lint + prettier + typecheck + vitest + npm audit (target < 3 menit, tanpa infra)
npm run test:e2e   # Playwright; butuh compose dev dan .env
npm run perf       # skenario performa (bukti di docs/ai/perf/)
```

## Memulihkan admin terakhir

Aplikasi menolak mencabut atau menonaktifkan admin aktif terakhir, dan `db:seed` tidak mengangkat
ulang akun yang sudah ada. Bila tetap tidak ada admin yang bisa masuk (mis. admin terakhir keluar
dan mailbox-nya dihapus), pulihkan akun karyawan lain yang **sudah terverifikasi** dari server:

```bash
node scripts/admin-restore.mjs nama.karyawan@pcpexpress.com            # dev
NODE_ENV=production node scripts/admin-restore.mjs nama.karyawan@pcpexpress.com --confirm
```

Skrip ini menjadikan akun itu aktif + admin, memutus sesi lamanya, dan menulis AuditLog
`user.admin.restore` (pelaku kosong, ip `cli`, meta berisi user OS + hostname operator) dalam satu
transaksi. Tanpa `--confirm` skrip hanya mau jalan bila `NODE_ENV` adalah `development`/`test`
(dibaca dari lingkungan, atau dari `.env` proyek bila belum di-set) DAN `DATABASE_URL` (termasuk
parameter `?host=`) menunjuk ke `localhost`/`127.0.0.1`/`::1`; selain itu wajib `--confirm` — di
server, `localhost` bisa saja database produksi. Akun yang sudah admin aktif tidak diubah (sesi tetap,
tanpa AuditLog). Setelahnya, admin itu masuk dan meninjau daftar admin di `/admin/pengguna`.

Di produksi skrip dijalankan dari dalam container app (`docker compose exec app node
scripts/admin-restore.mjs …`), jadi image app wajib membawa `scripts/admin-restore.mjs` dan
`@prisma/client`; output standalone Next tidak membawanya otomatis (dikerjakan di T-023).
