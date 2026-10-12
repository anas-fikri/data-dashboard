---
id: T-008
title: Halaman status ingest, review skema, dan koreksi
status: in_progress
profile: standard
goal: G-3
depends_on:
  - T-007
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T11:23:31Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 724603c823c68df2314d780f94b1513afd84391d
---

## Objective
Halaman profil dataset: progres per sheet (polling ≤ 5 s) dan pesan gagal. Tab skema per sheet: kolom, tipe, % null, unik, gagal cast, 50 baris sampel via src/lib/duckdb. Koreksi: pilih ulang baris header (metadata + re-cast, tanpa parse ulang), rename, ubah tipe/format tanggal termasuk override serial Excel, numberLocale, sembunyikan. Setiap simpan → recast T-007 → schemaRevision naik. UI via plugin frontend-expert.

## Acceptance criteria
- [ ] Given versi INGESTING, when halaman profil dibuka, then progres per sheet diperbarui ≤ 5 detik dan setelah FAILED pesan sheet/baris tampil
- [ ] Given ingest selesai, when membuka tab skema, then tiap sheet menampilkan kolom, tipe, % null, gagal cast, dan 50 baris sampel
- [ ] Given header terdeteksi di baris 1 padahal benar di baris 3, when user memilih baris 3, then skema diganti dengan nama dari baris 3, typed-<rev+1> dibuat tanpa membaca file asli, dan baris 1–3 tidak ada di data
- [ ] Given kolom teks '31-12-2025', when user mengubah tipe ke tanggal format dd-mm-yyyy, then kolom DATE dan jumlah baris gagal parse dilaporkan
- [ ] Given user mengganti nama tampil kolom, when menyimpan, then nama baru dipakai di builder dan nama asli tetap tersimpan
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- **Impact:**
  - Halaman profil dataset: blok statis "sedang diproses" diganti panel progres hidup.
  - Halaman baru /datasets/[id]/skema.
  - Kolom DB baru Sheet.preview (nullable; data lama = null → hanya input nomor baris).
  - API baru: GET /api/datasets/[id]/progress, POST /api/sheets/[id]/recast, GET /api/sheets/[id]/recast/[jobId].
  - Refactor execOnParquet di query (dipakai /api/query dan sampel).
  - Pesan gagal ingest kini diawali lokasi sheet/baris.
- **Security (STRIDE):**
  - **Spoofing:** semua rute memakai sesi server (requireUser("action")), tanpa sesi → 401.
  - **Tampering:**
    - Koreksi divalidasi zod strict: hanya enum dan angka bulat dalam rentang colCount/1.048.576.
    - Nama tampil tidak pernah masuk SQL.
    - Posisi kolom untuk SQL sampel berasal dari skema di DB (dibulatkan).
    - baseRevision wajib: edit dari tampilan lama → STALE, juga dicek ulang di worker.
  - **Repudiation:** enqueue dan hasil recast dicatat worker (jobId, sheetId, outcome).
  - **Information disclosure:**
    - Sheet selalu di-resolve lewat versi aktif dataset milik user (version.activeFor.ownerId); job milik sheet lain → 404.
    - Respons no-store; error tak terduga → 503 tanpa detail.
  - **DoS:**
    - Recast 20 per 10 menit per user dan worker concurrency 1.
    - Body POST ≤ 256 KB dibaca streaming; sampel ≤ 50 baris × 60 kolom × 200 karakter.
    - Preview ≤ 30 × 50 × 100 karakter.
    - Polling 2,5 s / 1,5 s berhenti saat selesai dan saat tab tersembunyi.
  - **Elevation:** CSRF — POST wajib Origin = APP_URL (403).
- **Rollback:**
  - Revert commit T-008. Migrasi sheet_preview hanya menambah kolom nullable (aman dibiarkan).
  - Revisi skema hasil koreksi tetap valid untuk kode lama (format Sheet.schema tidak berubah).
- **Validation:**
  - Unit: tests/features/schema/schema.test.ts (sampel nyata DuckDB, permintaan dan status koreksi, pesan gagal) dan tes pratinjau ingest.
  - e2e: tests/e2e/schema.spec.ts, project "schema", worker sungguhan, AC 1–5.
  - axe-core WCAG 2.2 AA: 0 pelanggaran di 17 kombinasi state × tema × lebar.
  - Overflow horizontal 0 px di 320/768/1024/1440.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-12T10:16:06Z Dikerjakan setelah T-009: sampel 50 baris dan pratinjau skema memakai cache lokal typed.parquet + DuckDB aplikasi (src/lib/query) yang dibangun T-009. Recast dipicu lewat enqueueRecast(sheetId, {baseRevision, headerRow?, columns?}) dari src/lib/queue/versions.ts; outcome busy/stale/invalid/failed ditampilkan ke user.
