# Data Dashboard

Pengganti dashboard Excel untuk PCP Express: upload xlsx/csv sampai 1 GB, rakit dashboard sendiri.
Acuan arsitektur dan alur: `docs/flow-kerja.md`. Task dan konvensi: `aitk brief`.

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
`user.admin.restore` (pelaku kosong, ip `cli`) dalam satu transaksi. Di produksi skrip menolak
tanpa `--confirm`. Setelahnya, admin itu masuk dan meninjau daftar admin di `/admin/pengguna`.
