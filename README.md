# Data Dashboard

Pengganti dashboard Excel untuk PCP Express. Karyawan (email domain perusahaan) mengunggah file **xlsx/csv
sampai 1 GB** ke profil dataset, lalu merakit dashboard sendiri — tanpa membuka file berat di Excel.
Data diubah sekali menjadi Parquet dan dihitung di server (DuckDB); browser hanya menerima ringkasannya.

**Fitur:** unggah langsung ke storage + versi data (ganti/kembali ke versi lama), tinjau & koreksi tipe kolom,
pemetaan kolom bila struktur file berubah, dashboard (KPI, grafik batang/garis/pai, tabel, filter, filter silang,
grid 12 kolom), berbagi (editor/viewer/seluruh organisasi), ekspor CSV/XLSX/PDF, panduan per peran (artikel +
video), admin (pengguna, panduan, **Integrasi**: Email SMTP dan Backup ke NAS Synology).

## Dokumentasi

| Dokumen                                                                                                  | Untuk                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`docs/ringkasan-dokumentasi.md`](docs/ringkasan-dokumentasi.md) · [PDF](docs/ringkasan-dokumentasi.pdf) | Ringkasan proyek: fitur, arsitektur, produksi, keamanan, status, tindak lanjut        |
| [`docs/panduan-developer.md`](docs/panduan-developer.md)                                                 | **Programmer baru mulai di sini**: peta kode, alur data, resep modifikasi, tes, rilis |
| [`docs/runbook-deploy.md`](docs/runbook-deploy.md)                                                       | Operator: deploy, update/rollback, backup/restore, TLS, troubleshooting               |
| [`docs/flow-kerja.md`](docs/flow-kerja.md)                                                               | Alur produk & aplikasi, keputusan mengikat                                            |
| [`docs/adr/`](docs/adr/)                                                                                 | Keputusan arsitektur (0001–0008)                                                      |
| [`content/panduan/`](content/panduan/)                                                                   | Panduan pengguna (juga tampil di menu Panduan aplikasi)                               |
| `docs/ai/`                                                                                               | Task, serah terima, pengetahuan proyek (dikelola `aitk`)                              |

PDF ringkasan dibuat ulang setelah dokumen diubah: `node scripts/md-to-pdf.mjs docs/ringkasan-dokumentasi.md`.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript · Prisma 6.12 (dipin) + PostgreSQL · DuckDB + Parquet ·
BullMQ + Redis 7 (worker terpisah) · RustFS (S3) · renderer PDF Chromium · ECharts · Tailwind · ikon Tabler ·
Vitest + Playwright · Docker Compose + Caddy di produksi.

## Menjalankan lokal

Prasyarat: Node ≥ 22.9 (`.nvmrc` = 22), Docker (Docker Desktop/OrbStack).

```bash
npm ci
npm run secrets:dev        # buat .env dengan secret acak dari .env.example
npm run compose:up         # PostgreSQL, Redis, RustFS (S3) + init bucket/CORS/lifecycle, Mailpit
npm run db:migrate         # migrasi Prisma (dev)
npm run db:seed            # admin pertama dari SEED_ADMIN_EMAIL
npm run dev                # http://localhost:3100 — cek http://localhost:3100/health
npm run worker             # terminal kedua: ingest, koreksi kolom, ekspor, PDF, pemeliharaan
```

Mailpit UI (email dev): http://localhost:8026 · RustFS console: http://localhost:9101.
PDF lokal: `npx playwright install chromium`, lalu `npm run renderer` (lihat panduan developer §2).

## Verifikasi

```bash
npm run check      # lint + prettier + typecheck + vitest + npm audit (wajib hijau sebelum commit)
npm run test:e2e   # Playwright; butuh compose dev dan .env (spec menyalakan worker/renderer sendiri)
npx playwright test --project=<nama> --no-deps   # satu project e2e saja
```

## Produksi

Server **olympus** (Docker Compose project `dashboard`, `/data/docker-data/data-dashboard`), HTTPS port 8443.
Deploy, pra-deploy (tag image + arsip kode + backup), rollback cepat, backup harian terenkripsi ke NAS Synology,
dan restore: ikuti [`docs/runbook-deploy.md`](docs/runbook-deploy.md). Rahasia hanya di `.env.prod` (mode 600) —
jangan pernah di repo.

## Repositori

| Remote   | Alamat                                                                | Peran                       |
| -------- | --------------------------------------------------------------------- | --------------------------- |
| `gitlab` | `gitlab.pcpexpress.com/pcp-express-developer/data-dashboard` (privat) | Repo utama milik perusahaan |
| `origin` | GitHub `anas-fikri/data-dashboard` (privat)                           | Salinan kedua               |

```bash
git push gitlab <branch> && git push origin <branch>    # kirim ke keduanya
```

Sebelum push ke remote baru, pindai riwayat: `gitleaks git --redact .` (tes memakai password dummy).

## Alur kerja

Task, review, dan penutupan dikelola `aitk` (repo memiliki `aitk.toml`): `aitk brief` → `aitk task next --start`
→ kerjakan → `aitk check` → review → `aitk close --summary "…" --knowledge "…|none"`. Detail di
[`docs/panduan-developer.md`](docs/panduan-developer.md) §9 dan `AGENTS.md`.

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
