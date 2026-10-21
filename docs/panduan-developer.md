# Panduan Developer — Data Dashboard

Untuk programmer yang melanjutkan atau memodifikasi aplikasi. Dokumen ini adalah **peta dan resep**; detail
keputusan ada di dokumen acuan:

| Dokumen | Isi |
|---|---|
| `docs/flow-kerja.md` | Alur produk (user) dan alur aplikasi (upload → ingest → query), keputusan mengikat |
| `docs/adr/0001…0008` | Keputusan arsitektur (Parquet + DuckDB, RustFS, sesi JWT, Redis noeviction, parser xlsx, renderer PDF, grid Lihat data, model periode) |
| `docs/runbook-deploy.md` | Deploy produksi, backup/restore, TLS, operasi harian, troubleshooting |
| `docs/ai/conventions.md` | Konvensi kode, kode galat, struktur |
| `docs/ringkasan-dokumentasi.md` | Ringkasan untuk manajemen/operator (versi PDF tersedia) |
| `content/panduan/*.md` | Panduan pengguna per peran (juga tampil di aplikasi) |

---

## 1. Gambaran singkat

Pengganti dashboard Excel: user (email domain perusahaan) mengunggah xlsx/csv ≤ 1 GB ke profil dataset, lalu
merakit dashboard (KPI, grafik, tabel, filter), membagikannya, dan mengekspor CSV/XLSX/PDF.

```
Browser ──HTTPS──► Caddy (proxy, TLS) ──► app (Next.js 16, port 3100)
   │ unggah langsung (presigned URL)          │  Server Action / Route Handler
   └─────────────────────────────► RustFS (S3) ◄──┐
                                                  │
 PostgreSQL (metadata) ◄── app ──► Redis (antrean BullMQ, rate limit, kunci)
                                   │
                         worker (BullMQ): ingest xlsx/csv → Parquet, recast, ekspor CSV/XLSX, PDF, pemeliharaan
                                   │
                         renderer (Chromium) ── membuka /render/<token> → PDF
 backup (cron 02.00 WIB): pg_dump + bucket → age → /backups → rclone SFTP ke NAS Synology
```

- **Data tabular tidak disimpan di PostgreSQL.** File asli → Parquet di S3 (segmen imutabel `parquet/<dataset>/seg/<segmen>/`, T-038; data lama di `parquet/<dataset>/<versi>/<sheet>/`),
  di-query dengan **DuckDB** (cache Parquet lokal + cache hasil di memori). PostgreSQL hanya metadata.
- **Stack:** Next.js 16 App Router (Turbopack) + React 19 + TypeScript strict, Prisma **6.12.0 (dipin)**, BullMQ +
  Redis 7, `@duckdb/node-api`, ECharts, Tailwind 4, ikon `@tabler/icons-react`, Playwright (e2e + renderer).
- **Bahasa:** semua teks UI Bahasa Indonesia (tanpa library i18n), waktu ditampilkan Asia/Jakarta.

---

## 2. Menjalankan di lokal

Prasyarat: Node ≥ 22.9 (`.nvmrc`), Docker (Docker Desktop/OrbStack).

```bash
npm ci
npm run secrets:dev        # buat .env dengan secret acak dari .env.example
npm run compose:up         # Postgres :5433, Redis :6380, RustFS :9100 (console :9101), Mailpit UI :8026
npm run db:migrate
npm run db:seed            # admin pertama dari SEED_ADMIN_EMAIL
npm run dev                # http://localhost:3100
npm run worker             # terminal kedua — WAJIB untuk ingest, recast, ekspor, PDF, pemeliharaan
```

PDF lokal: `npx playwright install chromium`, set `APP_INTERNAL_URL=http://localhost:3100` dan
`ALLOW_DEV_WEBSOCKET=true`, lalu `npm run renderer`.

User dev cepat: `npx tsx --conditions=react-server --env-file-if-exists=.env scripts/dev-create-user.ts
nama@pcpexpress.com --admin`.
Email (verifikasi, reset password) terlihat di Mailpit `http://localhost:8026`.

**Masalah umum di dev**
- Halaman terus reload ("HMR hash mismatch") setelah restart `next dev`, atau layout lama setelah menambah file:
  hentikan dev, `rm -rf .next/dev` (atau `.next`), jalankan lagi, buka halaman sekali sebelum e2e.
- Setelah migrasi Prisma, **restart** `npm run dev` dan worker (Prisma Client lama masih dimuat).
- Rate limit tersimpan di Redis: `node scripts/dev-reset-ratelimit.mjs [bucket]`.

---

## 3. Peta kode

### 3.1 Route (`src/app`)

| Grup | Route |
|---|---|
| `(auth)` | `/login`, `/register`, `/verify`, `/lupa-password`, `/reset-password` |
| `(app)` (app shell) | `/` beranda · `/datasets`, `/datasets/baru`, `/datasets/[id]`, `/datasets/[id]/skema`, `/datasets/[id]/pemetaan` · `/dashboards`, `/dashboards/baru`, `/dashboards/[id]` (`?mode=edit`, `?f=` filter) · `/panduan`, `/panduan/[slug]` · `/akun`, `/akun/keamanan` · `/admin`, `/admin/pengguna`, `/admin/panduan`, `/admin/email`, `/admin/backup` |
| lain | `/health`, `/render` + `/render/[token]` (halaman cetak PDF), `not-found.tsx` |
| `api/` | `auth/*`, `uploads/*` (multipart), `datasets/[id]/progress`, `datasets/[id]/mapping/[jobId]`, `sheets/[id]/recast*`, `query`, `dashboards/[id]/{widgets,layout,filter-columns,filter-values}`, `exports/*`, `guides/videos/*`, `health`, `health/core` |

- `src/proxy.ts` = middleware Next 16: nonce CSP + gerbang JWT, **deny-by-default** — route publik baru wajib
  ditambahkan ke `PUBLIC_PREFIXES`.
- `src/instrumentation.ts`: validasi env saat boot + pemanas cache Parquet.

### 3.2 Domain (`src/features/<domain>`)

| Domain | Tanggung jawab | File kunci |
|---|---|---|
| `auth` | daftar, verifikasi, login, reset, sesi JWT, rate limit | `actions.ts`, `service.ts`, `session.ts` (`requireUser`, `requireAdmin`), `jwt.ts`, `rate-limit.ts` (`RULES`, `hit`, `clientIp`), `password.ts` (argon2id) |
| `uploads` | unggah multipart langsung ke S3 | `service.ts` (`initUpload`, `signParts`, `completeUpload`), `client.ts` (mesin browser) |
| `ingest` | file → Parquet raw → tipe kolom → Parquet typed | `ingest.ts` (`runIngest`), `csv.ts`, `raw-writer.ts`, `infer.ts`, `typed.ts`, `recast.ts`, `mapping.ts`, `refresh.ts` |
| `versions` | riwayat versi, aktivasi, rollback, retensi | `service.ts`, `activation.ts`, `retention.ts`, `cleanup.ts` |
| `datasets` | profil dataset (pemilik) | `service.ts`, `actions.ts`, `validation.ts` |
| `schema` | tinjau/koreksi skema (lewat Route Handler, bukan Server Action) | `service.ts`, `http.ts`, `runtime.ts` |
| `query` | spesifikasi query widget → SQL DuckDB, cache | `spec.ts`, `sql.ts`, `filters.ts`, `widget.ts` (`widgetPlan`), `service.ts` (`runWidgetQuery`), `cache.ts`, `local-parquet.ts` |
| `dashboards`, `widgets` | CRUD dashboard/widget, layout grid 12 kolom | `dashboards/service.ts`, `dashboards/validation.ts`, `widgets/spec.ts`, `widgets/remap.ts` |
| `sharing` | akses OWNER/EDITOR/VIEWER, berbagi ke organisasi | `access.ts` (satu-satunya aturan akses), `service.ts`, `actions.ts` |
| `exports` | CSV/XLSX (worker) dan PDF (worker + renderer) | `job.ts`, `csv.ts`, `xlsx.ts`, `pdf-job.ts`, `render-token.ts`, `renderer-client.ts` |
| `guides` | artikel + video panduan per peran | `service.ts`, `reader.ts`, `markdown.tsx`, `content.ts`, `videos.ts` |
| `admin` | kelola pengguna (tambah/hapus/nonaktif/admin/alihkan dataset) | `actions.ts`, `service.ts`, `guard.ts` (`currentAdmin`, `rateLimited`) |
| `smtp`, `backup` | Admin › Email, Admin › Backup ke NAS Synology | `service.ts`, `actions.ts`, `backup/probe.ts` (tes SFTP ssh2) |
| `audit` | AuditLog append-only | `service.ts` (`AuditAction`, `recordAudit`) |

### 3.3 Infrastruktur bersama (`src/lib`)

`env.ts` (validasi zod) · `db.ts` (Prisma) · `redis.ts` · `logger.ts` (pino, redaksi kunci sensitif) · `lock.ts` ·
`api-route.ts` (`withUser`, `readJson`, `rejectCrossOrigin`) · `mail.ts` + `smtp-settings.ts` · `config-dir.ts` ·
`duckdb/` (`QueryEngine`, cache Parquet LRU) · `queue/` (nama antrean, opsi job, `enqueueIngest`/`Recast`/`Mapping`)
· `storage/` (klien S3, multipart, objek) · `xlsx/` (parser streaming yauzl + saxes, sheet paralel) · `health/`.

### 3.4 Komponen UI (`src/components`)

Per fitur: `admin`, `auth`, `dashboards` (+ `filters/`), `datasets`, `guides`, `mapping`, `render`, `schema`,
`sharing`, `shell`, `widgets`. Primitif di `ui/`: `avatar`, `badge`, `button`, `card`, `confirm-dialog`,
`dropdown-menu`, `empty-state`, `field`, `focus-notice`, `input`, `page-header`, `password-input`, `popover`,
`select`, `switch`, `textarea`. **Pakai primitif ini** — jangan membuat komponen dasar baru.

### 3.5 Proses lain

- **Worker** `src/worker/index.ts` (`npm run worker`, tsx `--conditions=react-server`). Antrean: `ingest`
  (jobId = versionId), `recast` (`recast`, `map-version`), `export`, `pdf`, `maintenance` (terjadwal:
  `expire-stale-uploads`, `recover-stuck-ingests`, `storage-cleanup`, `raw-retention`, `export-cleanup`). Semua
  concurrency 1; saat start memulihkan unggahan/ingest yang macet.
- **Renderer** `renderer/` — proses Chromium terpisah untuk PDF, env sendiri (`renderer/env.ts`, tidak memakai
  `src/lib/env.ts`).
- **Database** `prisma/schema.prisma` (21 migrasi): `User`, `VerificationToken`, `Dataset`, `DatasetVersion`
  (UPLOADING → UPLOADED → INGESTING → AWAITING_MAPPING → READY | FAILED), `Sheet` (kunci Parquet, `schema`,
  `schemaRevision`), `StorageCleanup`, `Dashboard`, `Widget`, `DashboardShare`, `Export`, `AuditLog`,
  `GuideArticle`, `GuideRead`, `GuideVideo`.
- **Skrip** `scripts/`: `admin-restore.mjs` (pulihkan admin), `seed-guides.ts`, `gen-dev-env.mjs`,
  `storage-init.mjs`, `dev-*` (bantuan dev/e2e, menolak produksi), `perf-*`, `make-fixture.ts`,
  `record-guide-videos.ts`.
- **Deploy** `deploy/`: `deploy.sh`, `images.sh`, `backup.sh`, `restore.sh`, `verify-backup.sh`,
  `fingerprint.sh`, `host-db.sh`, `convert-db-utf8.sh`, `rotate-db-password.sh`, `lan-cert.sh`,
  `empty-vm-drill.sh`, `Caddyfile`, `backup/Dockerfile` — lihat runbook.

---

## 4. Alur data utama

**Unggah → dataset siap**
1. Browser (`upload-panel.tsx` + `uploads/client.ts`) → `POST /api/uploads` (`initUpload`: kepemilikan, batas
   ukuran, kuota dari byte tersimpan + proyeksi parquet (T-039, `src/features/uploads/quota.ts`), maks 2 unggahan
   aktif) → versi `UPLOADING` + multipart S3 `raw/<ds>/<ver>/source.<ext>`.
2. `POST …/parts` → URL presigned; browser PUT potongan **langsung ke S3** (4 paralel) → `POST …/complete` →
   `UPLOADED` → `enqueueIngest`.
3. Worker `runIngest`: unduh ke `WORKER_TMP_DIR` → xlsx (parser streaming, sheet paralel) / csv (DuckDB
   `read_csv`) → `raw.parquet` → baris `Sheet` (tebakan baris judul, pratinjau) → `writeTyped` (inferensi tipe) →
   `typed-1.parquet`. Bila dataset sudah aktif, `refresh.ts` memakai skema aktif.
4. `versions/activation.ts`: aktifkan versi, remap widget, retensi → `READY` (atau `AWAITING_MAPPING` bila kolom
   berubah → halaman `/pemetaan`). UI memantau `/api/datasets/[id]/progress`.
5. Koreksi skema: nama/sembunyi langsung; tipe/format/baris judul lewat job `recast` (`typed-<rev>-…parquet`).
   Recast per segmen manifest (T-040): profil raw tersimpan (`ingest/profile.ts`), hanya segmen yang cast-nya
   berubah ditulis ulang, titik lanjut per segmen, swap manifest atomik, progres `job.progress` → banner.
   Uji sheet banyak segmen di dev: `npx tsx --conditions=react-server --env-file-if-exists=.env
   scripts/dev-segments.ts split <sheetId> <n>`.

**Query widget**
`widget-query.ts` → `POST /api/query` → `requireUser` + same-origin + `RULES.query` → `runWidgetQuery` →
`resolveWidget` (peran dari `sharing/access`, `parseWidgetConfig`, remap, `widgetPlan`, filter dashboard) →
kunci cache SHA-256 (dataset, versi, sheet, `schemaRevision`, spec) → hit: cache hasil; miss: Parquet lokal →
DuckDB (`buildSql` / `buildTotalsSql` / `buildTablePage`) → `forRole` → klien. Render: `widget-body.tsx` →
`kpi-view.tsx` | `table-view.tsx` | `chart-widget.tsx` (ECharts dimuat dinamis).

**Ekspor**
- CSV/XLSX: `POST /api/exports` → `createExport` (maks 2 berjalan/user) → worker `runExportJob` (cek akses ulang,
  batas `EXPORT_MAX_ROWS`, CSV dengan netralisasi formula / XLSX streaming) → `exports/<user>/<id>.<ext>` →
  unduh via URL presigned + AuditLog.
- PDF: worker membuat token render sekali pakai (Redis, 60 dtk) → renderer membuka `/render/<token>` → halaman
  `/render` menjalankan semua query di server → Chromium mencetak PDF → worker memeriksa `%PDF-` + ukuran.

**Berbagi & akses** — aturan hanya di `sharing/access.ts`: OWNER = pemilik dataset; selain itu share tertinggi
(VIEWER/EDITOR); berbagi ke organisasi = VIEWER. Objek yang tidak boleh diakses **selalu 404/NOT_FOUND**.

**Auth** — daftar (domain `ALLOWED_EMAIL_DOMAINS`, argon2id, token verifikasi) → verifikasi (POST, bukan sekadar
membuka link) → login → JWT `{sub, sv}` di cookie `__Secure-dd.session` (12 jam). `proxy.ts` hanya cek tanda
tangan; `requireUser`/`requireAdmin` cek DB (`isActive`, `sessionVersion`, `isAdmin`). Naikkan `sessionVersion`
untuk memutus semua sesi.

---

## 5. Resep modifikasi

Daftar file di bawah sudah dicocokkan dengan kode (Oktober 2026). Setiap resep diakhiri tes yang perlu
disesuaikan; jalankan `npm run check` dan e2e terkait.

### 5.1 Tipe widget / grafik baru
- Definisi: `features/widgets/spec.ts` (`WIDGET_TYPES`, `CHART_TYPES`, skema, `parseWidgetConfig`, `columnsOf`),
  `features/widgets/remap.ts`, `features/query/widget.ts` (`widgetPlan`), `features/exports/sql.ts` (bila jenis
  rencana baru).
- Dashboard: `features/dashboards/validation.ts` (`MIN_BY_TYPE`), `features/dashboards/{filter-columns,service}.ts`.
- Panel atur: `components/dashboards/widget-config-model.ts` (`TYPE_OPTIONS`), `widget-config.tsx`,
  `config-sections.tsx`, `widget-card-model.ts`, `widget-card-head.tsx`, `layout-ops.ts`.
- Render: `components/widgets/widget-body.tsx`, `body-state.ts`; grafik: `chart-widget.tsx`, `chart-option.ts`,
  `chart-series.ts`, `chart-view.tsx`; PDF: `components/render/print-card.tsx`.
- Tes/dok: `tests/components/widget-config.test.ts`, `tests/features/query/widget-plan.test.ts`,
  `tests/e2e/widgets.spec.ts`, `content/panduan/06-susun-dashboard.md`.

### 5.2 Agregasi baru
- Hanya label/pilihan UI (contoh "Jumlah terisi", T-3z0y = `count(kolom)`): `widget-config-model.ts`
  (`AggChoice`, `aggChoiceOptions`, `measureForChoice`), `config-sections.tsx`, `features/query/spec.ts`
  (`AGG_LABEL`), panduan + `tests/components/widget-config.test.ts`.
- Agregasi SQL baru (mis. median): `features/query/spec.ts` (`AGGS`, `AGG_TYPES`, `AGG_LABEL`, tipe keluaran),
  `features/widgets/spec.ts` (`AGGS`, `PIE_AGGS`), `features/query/sql.ts` (`buildSql`, `buildTotalsSql`),
  `widget-config-model.ts` (`AGG_ORDER`, `columnsForAgg`), `components/widgets/kpi-view.tsx`,
  `tests/features/query/query.test.ts`.

### 5.3 Jenis filter dashboard baru
- Server: `features/query/filters.ts` (`dashFilterSchema`, `toClause`, `fits`, `typeFamily`),
  `features/query/sql.ts` (`dashClauses`).
- Klien (**salinan aturan, sinkronkan manual**): `components/dashboards/filters/filter-model.ts`,
  `filter-text.ts`, panel baru `*-panel.tsx`, lalu `filter-control.tsx`, `filter-sheet.tsx`, `filter-chips.tsx`.
- PDF: `features/exports/pdf-filter.ts`. Tes: `tests/features/query/dashboard-filters.test.ts`,
  `tests/components/dashboard-filters*.test.ts`, `tests/e2e/filters.spec.ts`.

### 5.4 Tipe kolom / aturan parser
- Format tanggal baru: `features/ingest/infer.ts` (`DATE_FORMATS`), `features/ingest/recast-input.ts`,
  `components/schema/labels.ts`.
- Tipe kolom baru: ikuti semua tempat yang menangani `"duration"` — `ingest/infer.ts`, `ingest/recast-input.ts`,
  `schema/labels.ts`, `schema/sample-table.tsx`, `query/{spec,sql,filters}.ts`,
  `exports/{sql,xlsx,job}.ts`, `widgets/format.ts`, `dashboards/widget-config-model.ts`,
  `filters/{filter-model,filter-text}.ts`, `filters/number-panel.tsx`,
  `widgets/{chart-option.ts,kpi-fit.ts,table-view.tsx}`.
- Sel mentah/encoding: `src/lib/xlsx/{parser,types}.ts`, `features/ingest/{raw-text,csv-sniff,csv}.ts`.
- Tes: `tests/features/ingest/{pure,typed}.test.ts`.

### 5.5 Halaman/bagian admin baru
1. `src/app/(app)/admin/<slug>/page.tsx` dengan `await requireAdmin()` (non-admin → 404) dan
   `PageHeader eyebrow={<AdminCrumb/>}`.
2. Kartu di `GROUPS` pada `src/app/(app)/admin/page.tsx` (kelompok **Kelola** atau **Integrasi**, ikon Tabler).
3. Form di `src/components/admin/<x>-form.tsx`.
4. `features/<domain>/actions.ts` ("use server") dengan pembungkus admin: `currentAdmin()` → NOT_FOUND,
   `rateLimited()`, `unstable_rethrow`, galat tak terduga → `BUSY`, `revalidatePath`. Contoh paling dekat:
   `features/smtp/actions.ts`.
5. `service.ts` + `types.ts`; tambahkan aksi ke union `AuditAction` dan panggil `recordAudit(tx, …)` di transaksi
   yang sama.
6. Tes `tests/features/<domain>/` + e2e (project Playwright sendiri bila menyentuh state bersama).

### 5.6 Job background baru
1. `src/lib/queue/connection.ts`: nama antrean, tipe data job, opsi job, fungsi produser.
2. Enqueue dari service/`http.ts` dengan `jobId` idempoten.
3. Logika job di `features/<domain>/job.ts` dengan dependensi yang bisa diganti di tes.
4. `src/worker/index.ts`: `new Worker(...)`, handler `failed` (tandai status di DB), masuk `shutdown()`.
   Job terjadwal cukup entri `schedules` + cabang di `maintenanceWorker`.

### 5.7 Model Prisma baru
1. Ubah `prisma/schema.prisma` (komentar `///`, `onDelete`, indeks).
2. `npm run db:migrate -- --name t0xx_<nama>` → commit `prisma/migrations/<ts>_<nama>/migration.sql`.
3. Restart dev + worker. Akses lewat service/repo memakai `src/lib/db.ts`.
4. Periksa efek ke pengalihan dataset admin (`features/admin/service.ts`) dan `scripts/dev-purge-test-data.mjs`.
5. Produksi: service `migrate` menjalankan `prisma migrate deploy` sebelum app/worker. **Jangan naikkan Prisma
   melewati 6.12.0** (6.13–8.x membawa `deepmerge-ts` rentan).

### 5.8 Variabel env baru
1. `src/lib/env.ts` (`envSchema`; masukkan ke `SENSITIVE_VARS` bila rahasia).
2. `.env.example` (dengan komentar; rahasia memakai placeholder `change-me` + entri di `scripts/gen-dev-env.mjs`).
3. `docker-compose.prod.yml` blok `x-app-env` (renderer punya blok sendiri + `renderer/env.ts`).
4. `deploy/deploy.sh` bila nilainya harus dibuat/diisi operator.
5. `Dockerfile` hanya untuk default non-rahasia. Tes: `tests/lib/env.test.ts`.

### 5.9 Artikel panduan pengguna
1. `content/panduan/NN-<slug>.md` dengan frontmatter `title`, `slug`, `role` (`OWNER|EDITOR|VIEWER|ADMIN|ALL`),
   `context` opsional (`UPLOAD|SCHEMA|BUILDER`).
2. `tests/features/guides/content.test.ts` memeriksa nama file, slug unik, dan cakupan peran/konteks.
3. Terbitkan: `npx tsx --conditions=react-server --env-file-if-exists=.env scripts/seed-guides.ts [--update]
   [--only slug]`; di produksi dari container worker (runbook §Isi panduan). Admin juga bisa menyunting di
   `/admin/panduan` — **database adalah salinan hidup**, file repo hanya bahan seed.

---

## 6. Konvensi wajib

- **Server Action** mengembalikan `{ ok: true, data } | { ok: false, code, message, field? }` — kegagalan yang
  diharapkan dikembalikan, tidak dilempar. Galat tak terduga → `logger.error` + `BUSY`. Panggil
  `unstable_rethrow(e)` dulu di `catch`.
- **Route Handler** memakai `src/lib/api-route.ts` (`withUser` 401/503, `rejectCrossOrigin` 403, `readJson`
  400/413), selalu `Cache-Control: no-store`.
- **NOT_FOUND, bukan 403** untuk objek/halaman yang tidak boleh diakses (termasuk halaman admin bagi non-admin).
- **Log** pino terstruktur: `logger.info({ datasetId, versionId }, "pesan")`, tanpa rahasia (kunci sensitif
  diredaksi otomatis). **Audit** setiap perubahan penting via `recordAudit` di transaksi yang sama, tanpa rahasia
  di `meta`.
- **Rate limit**: `RULES` di `auth/rate-limit.ts`, `hit(redis, rule, subject)`.
- **SQL**: kolom widget dirujuk per posisi (`c<pos>`), nilai user selalu parameter terikat — nama/nilai user
  tidak pernah disusun ke SQL.
- **UI**: Bahasa Indonesia, ikon **Tabler** (`size={20} stroke={1.5}`), primitif `components/ui`, mobile-first
  (tombol utama penuh lebar < 768 px), aksesibel (label, fokus, kontras).
- **Penamaan**: file kebab-case, komponen PascalCase, fungsi camelCase.

## 7. Jebakan yang perlu diketahui

- **Next.js 16** berbeda dari versi lama: baca `node_modules/next/dist/docs/` sebelum menulis kode Next (lihat
  `AGENTS.md`). Middleware bernama `src/proxy.ts`.
- **Klien S3** wajib `requestChecksumCalculation`/`responseChecksumValidation: "WHEN_REQUIRED"`
  (`src/lib/storage/s3.ts`), kalau tidak RustFS menolak URL presigned (BadDigest).
- **`serverExternalPackages`** (next.config.ts) untuk paket native/Node murni (pino, Prisma, ioredis, nodemailer,
  argon2, ssh2, DuckDB). Dockerfile menyalin `@duckdb`, `.prisma`, `@prisma` ke output standalone.
- **`turbopackIgnore`** di `src/lib/config-dir.ts`: tanpa itu build menelusuri seluruh proyek (+20 MB image).
- **`server-only`** di luar Next (worker, skrip) butuh `tsx --conditions=react-server`.
- **Body > 3 MB** ke app terpotong diam-diam (`proxyClientMaxBodySize`) — unggahan file selalu lewat presigned
  URL ke S3.
- **Produksi menolak start** bila ada secret placeholder, `TRUST_PROXY` bukan true, atau `APP_URL` bukan https.
- **Redis `noeviction`** (ADR-0004): cache hasil query ada di memori proses, bukan Redis.
- **Aturan klien = salinan aturan server** (filter, agregasi) — ubah keduanya bersamaan.
- **AG Grid Enterprise dilarang** (ADR-0007, dicek tes).
- **NAS Synology lewat SFTP**: DSM menolak mengatur izin/waktu file di folder ber-ACL; tes koneksi dan
  `backup.sh` sengaja menulis tanpa atribut (`set_modtime=false`, `--ignore-existing`). File ≤ ±2 KB tetap masuk
  walau ruang/kuota NAS habis (Btrfs inline), karena itu file uji tes koneksi 64 KB. `FAILURE` saat menulis file
  besar = ruang/kuota NAS habis.

---

## 8. Tes

| Perintah | Isi |
|---|---|
| `npm run check` | eslint + prettier + typecheck + vitest (±1.960 tes) + `npm audit` — wajib hijau sebelum commit |
| `npm run test:e2e` | Playwright; butuh `compose:up`, `.env` (`E2E_ENDPOINTS=1`), Chromium. Spec menyalakan worker/renderer sendiri — **jangan** jalankan worker sendiri saat e2e |
| `npx playwright test --project=<nama> --no-deps` | satu project saja (urutan project: e2e → guide-roles → ingest → schema → widgets → admin → backup → filters → versions → mapping → sharing → exports → pdf → kpi-fit → chart-polish → rate-limit) |
| `npx tsx --conditions=react-server scripts/perf-<x>.ts <fixture>` | uji performa; fixture dari `scripts/make-fixture.ts` ke `tests/fixtures/perf/` (gitignored), bukti di `docs/ai/perf/` |

Letak tes mengikuti `src/`: `tests/features/<domain>/`, `tests/components/`, `tests/lib/`, `tests/scripts/`
(skrip bash diuji dengan perintah tiruan), `tests/e2e/`. Stub: `tests/stubs/` (`server-only`, server SFTP tiruan).

## 9. Alur kerja & rilis

1. **Task** dikelola dengan `aitk` (repo memakai `aitk.toml`): `aitk brief` → `aitk task next --start` (atau
   `aitk task new "<judul>" --ac "Given…, when…, then…"`) → kerjakan → `aitk check` sampai hijau →
   `aitk impact` → review (≥ 2 putaran, terakhir 0 temuan) → `aitk task update <id> --ac-done 1,2` → isi Risk
   (+ checklist ASVS untuk task strict) → `aitk audit` → `aitk close --summary "…" --knowledge "…|none"`.
   Tanpa aitk: baca `docs/ai/project-context.md` dan handoff terbaru di `docs/ai/handoff/`.
2. **Git**: kerja di branch, commit kecil per task, remote privat (lihat tim).
3. **Deploy produksi** (server olympus) — ikuti `docs/runbook-deploy.md` §6 "Update" persis:
   - pra-deploy **manual** (`deploy.sh` tidak mengerjakannya): tag keempat image `prev-<stamp>`, arsipkan kode
     lama ke `../data-dashboard-prev-<stamp>.tar.gz`, jalankan backup sekali;
   - sinkron kode (`git pull` atau `git archive` → ekstrak di server) lalu `bash deploy/deploy.sh` (build di
     VM, migrasi, `up --wait`, health hijau) — atau build image di luar VM (`deploy/images.sh`, `IMAGE_TAG`);
   - artikel panduan berubah → `seed-guides.ts --update --only <slug>` di container worker.
4. **Versi & rilis per tonggak** (T-066, runbook §9): versi hanya di `package.json`, dinaikkan `aitk release`
   (G-7: minor per tonggak, v1.1.0 → v1.2.0 → v1.3.0). Kode server membaca `APP_VERSION`/`versionInfo()` dari
   `src/lib/version.ts` (server-only; komponen klien menerima versi lewat props — menu akun lewat
   `AppShell appVersion`), renderer dari `renderer/version.ts`. Commit pendek = build arg `APP_COMMIT`.
   Alur: `aitk release` → `deploy/images.sh build` (tag bawaan `v<versi>`, tag eksplisit menang) →
   `deploy/upgrade.sh` (preflight → load → migrate → start). Tag rilis lama + `prev-<stamp>` tetap untuk
   rollback. Versi hanya untuk pengguna yang masuk dan admin `/health`; publik tidak melihatnya.
5. **Rollback cepat** (runbook §6 "Rollback cepat"): ekstrak arsip kode lama, kembalikan tag image
   `prev-<stamp>` ke tag yang dipakai compose (`IMAGE_TAG` di `.env.prod`, bawaan `latest`), `up -d`, lalu
   buat ulang `proxy` + `backup`. Migrasi DB tidak dibalik otomatis — pulihkan dari backup (runbook §5) bila
   skema baru tidak kompatibel.

## 10. Operasional singkat (detail di runbook)

- **Health**: `https://<host>:8443/api/health` (detail untuk admin), `/api/health/core` (Docker).
- **Log**: `docker compose --env-file .env.prod -f docker-compose.prod.yml logs --since 1h app worker`.
- **Email**: Admin › Email (SMTP) di aplikasi; `SMTP_URL` di `.env.prod` hanya cadangan.
- **Backup**: harian 02.00 WIB, terenkripsi age (kunci privat **tidak** di server), retensi 30 hari, salinan ke
  NAS Synology (Admin › Backup ke NAS Synology, SFTP, kunci host dipin). NAS tidak terjangkau → arsip ditahan di
  server, dikirim ulang tiap 30 menit, admin diberi tahu (email + banner). Verifikasi: `deploy/verify-backup.sh
  [--remote]` dengan kunci privat lewat stdin.
- **Admin hilang**: `scripts/admin-restore.mjs` (README).
