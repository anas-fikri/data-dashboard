---
id: T-007
title: Inferensi tipe dan typed.parquet per schemaRevision
status: in_progress
profile: standard
goal: G-3
depends_on:
  - T-006
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T07:22:24Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: ae491a653eb3e594e7e2b4206be02da59ce09105
---

## Objective
Alur B3 tahap typed untuk versi pertama. Inferensi penuh via DuckDB TRY_CAST atas raw (WHERE _row > headerRow): bulat → DECIMAL(38,6) → tanggal/waktu pola teks → boolean literal (true/false/ya/tidak/yes/no, bukan 0/1) → teks; terpilih bila ≥ 98% non-kosong lolos. Deteksi numberLocale per kolom (ID bila ada ',' desimal atau pola \.\d{3}). Tanggal naive tanpa zona (D8). Tulis typed-1.parquet; nilai gagal → NULL + jumlah. Skema (nama tampil, nama asli, tipe, format tanggal, numberLocale, hidden=false, nullPct, distinctCount, castFailCount) + schemaRevision=1 ke PostgreSQL. Fungsi recast(sheet, schema) → typed-<rev+1>.parquet baru, pointer diganti setelah lengkap, file lama dihapus setelah 1 jam, lock Redis SET NX recast:<sheetId>.

## Acceptance criteria
- [ ] Given kolom 99% angka 1% teks, when inferensi, then tipe DECIMAL dengan castFailCount = jumlah teks; given kolom 90% angka 10% teks, then tipe teks
- [ ] Given kolom berisi hanya 0 dan 1, when inferensi, then tipe bilangan bulat (bukan boolean); given kolom berisi 'ya'/'tidak', then boolean
- [ ] Given kolom '1.234.567,89' dan kolom '1234.5', when inferensi, then kolom pertama numberLocale ID bernilai 1234567.89 dan kolom kedua US bernilai 1234.5
- [ ] Given kolom tanggal xlsx asli dan kolom teks '03/01/2026', when inferensi, then keduanya DATE bernilai 2026-01-03 tanpa pergeseran zona
- [ ] Given recast dipanggil dua kali bersamaan pada sheet yang sama, when berjalan, then hanya satu yang mengeksekusi, menghasilkan typed-2.parquet, dan typed-1.parquet masih ada sampai 1 jam

## Risk
Risk level: HIGH. Tahap typed menentukan nilai yang dilihat semua dashboard, dan recast menerima input user (T-008) yang ikut membentuk SQL. Salah tipe berarti angka/tanggal salah di dashboard; salah validasi berarti SQL rusak atau DoS worker.

Impact surface:
- **Data:** migrasi typed_schema (Sheet.typedKey, schemaRevision, schema JSON). DatasetVersion menjadi READY + aktif (Dataset.activeVersionId) setelah semua sheet typed.
- **Pipeline:**
  - src/features/ingest/infer.ts: profil, keputusan tipe, ekspresi SQL;
  - typed.ts, recast.ts;
  - ingest.ts: tahap typed + finish;
  - repo.ts: setTyped, finish, prismaRecastRepo;
  - recovery.ts: penyapu tanpa filter tahap.
- **Lib:** src/lib/lock.ts (lock Redis), src/lib/queue (antrean recast, enqueueRecast, producer generik), src/lib/storage/objects.ts (deleteObject).
- **Worker:** antrean recast (concurrency 1) dan job maintenance delete-object (tertunda 1 jam).

Security (STRIDE):
- **Tampering/injection:** input recast divalidasi zod di recastSheet (selain di API T-008).
  - Tipe, locale, dan format tanggal berupa enum; pos dan headerRow bilangan bulat dalam rentang; kunci asing ditolak.
  - SQL hanya dibangun dari enum, angka, dan identifier c<pos> yang dikutip. Nama tampil tidak pernah masuk SQL. Pola regex dan format strptime adalah konstanta program, dilewatkan sebagai literal.
- **DoS:**
  - Profil memakai format long (UNPIVOT), sehingga jumlah agregat tetap untuk 2.048 kolom.
  - Profil dan COPY typed di bawah watchdog (deadline + dataset/sheet masih ada) dan memory_limit DuckDB.
  - Recast: satu per sheet (lock SET NX PX 30 menit, dilepas dengan compare-and-delete) dan concurrency 1 per worker.
- **Information disclosure:** typed.parquet di prefix versi yang sama dengan raw, tanpa presigned GET.
- **Elevation:** deleteObject hanya menerima kunci parquet/ tanpa "..". Kunci berasal dari DB (typedKey lama), bukan dari user.
- **Repudiation:** log jobId/sheetId/outcome recast.

Compatibility:
- Versi selesai ingest kini READY dan aktif (label "Siap").
- Sementara sampai T-013: setiap versi diinferensi dan diaktifkan. T-013 mengganti jalur refresh dengan cast memakai skema aktif.
- typed.parquet memakai nama kolom posisional c<pos>; nama tampil ada di Sheet.schema (dipakai T-009).

Failure modes:
- **Job ingest diulang:** prefix dan Sheet dibersihkan dulu; typed-1 deterministik (diuji identik bersama raw).
- **Recast bersamaan:** satu dieksekusi, yang lain "busy" lalu diulang BullMQ dengan backoff.
- **Revisi berubah di tengah recast:** file baru dihapus, pointer lama tetap ("stale").
- **Worker mati saat recast:** lock kedaluwarsa 30 menit; pointer belum diganti; file typed-<rev+1> yatim di prefix versi ikut terhapus saat versi/dataset dihapus.
- **Job delete-object hilang:** typed lama tertinggal di prefix versi dan ikut terhapus saat versi/dataset dihapus (retensi T-013).

Rollback: revert commit T-007. Migrasi typed_schema hanya menambah kolom (nullable/default) sehingga boleh tetap. Versi READY tetap terbaca karena raw tidak berubah.

Validation:
- **Unit:**
  - typed.test.ts: AC 1–4, angka kanonik xlsx, kode bernol-depan, durasi, timestamp, statistik, decide;
  - recast.test.ts: AC 5, pilihan bertahan, ganti header, stale, lock dilepas saat error, input tidak valid;
  - ingest.test.ts: typed identik setelah job diulang;
  - recovery.test.ts.
- **e2e:** ingest.spec dengan worker sungguhan: READY + aktif + raw/typed per sheet, label "Siap" di halaman.
- **Perf:** docs/ai/perf/T-007.md (ingest 1 GB penuh, termasuk tahap typed).

Open risks/assumptions:
- distinctCount pasti hanya untuk kolom ≤ 10.000 nilai unik; di atas itu perkiraan HyperLogLog (± 2–4%).
- Format durasi [h]:mm dan jam (h:mm) sama-sama tersimpan sebagai durasi detik (format angka tidak tersimpan di raw).
- Bulan bernama (Jan/Mei/Agu) belum dikenali sebagai tanggal; user bisa memilih tipe di T-008.

## Notes
- 2026-10-11T14:56:59Z Lock recast: SET NX PX 30 menit + compare-and-delete (Lua) agar worker mati tidak mengunci selamanya. Hapus typed lama via job, bukan lifecycle.
- 2026-10-12T02:59:45Z Dari review T-005: format angka durasi seperti [h]:mm dideteksi parser sebagai tanggal (serial 1.5 → 1899-12-31T12:00); inferensi tipe harus mengenali kolom berformat durasi dan menyimpannya sebagai durasi/angka, bukan tanggal.
