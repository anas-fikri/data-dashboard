---
id: T-006
title: 'Worker ingest: raw.parquet posisional, header metadata, idempoten'
status: in_progress
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-004
  - T-005
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T04:41:01Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 561f910b5d41b43569cc74d52a0f81a359ac32e4
---

## Objective
Alur B3 tahap raw. Proses worker/ terpisah, BullMQ concurrency 1, DuckDB memory_limit 1GB + temp_directory. Stream dari MinIO, SHA-256 sambil jalan. CSV: sniff 64 KB (encoding UTF-8/Windows-1252, delimiter, quote). xlsx: verifikasi ZIP/workbook, sheet satu per satu dengan parser ADR-0002, sel tanggal → ISO. Batch 50k → raw.parquet kolom posisional c1..cN VARCHAR + _row, semua baris. Tiap batch cek dataset masih ada. Setelah sheet: tebak headerRow (heuristik ≥ 60% sel teks unik non-kosong), nama kolom unik deterministik (kosong → kolom_<pos>, duplikat → _2), nama asli disimpan. Progres per sheet (baris diproses, total perkiraan) ditulis ke versi tiap ≤ 5 detik. Error → hapus semua objek Parquet versi, FAILED + pesan sheet/baris. Job diulang → hapus objek versi dulu (idempoten). Lib bersama src/lib/duckdb (koneksi, baca Parquet lokal/S3, interrupt) dibangun di sini.

## Acceptance criteria
- [ ] Given fixture xlsx 3 sheet dengan header di baris ke-4, header kosong dan duplikat, when ingest, then headerRow=4 tersimpan, kolom bernama unik deterministik dengan nama asli tersimpan, dan jumlah baris raw per sheet = baris data + baris di atas header
- [ ] Given fixture csv Windows-1252 delimiter titik koma, when ingest, then encoding dan delimiter terdeteksi dan karakter aksen utuh di raw.parquet
- [ ] Given job dibunuh di tengah lalu diulang BullMQ, when job kedua selesai, then objek Parquet versi identik dengan ingest tanpa gangguan dan tidak ada objek parsial tersisa
- [ ] Given dataset dihapus saat ingest berjalan, when batch berikutnya diproses, then worker berhenti dan objek versi dihapus
- [ ] Given file xlsx rusak di tengah, when ingest gagal, then versi FAILED dengan pesan sheet/baris dan tidak ada objek Parquet versi tersisa
- [ ] Given fixture xlsx 1 GB (perf), when ingest penuh, then selesai < 15 menit dengan puncak RSS < 2 GB; bukti di docs/ai/perf/T-006.md
- [ ] Given fixture zip-bomb kecil (rasio > 20×) atau xlsx dengan <!DOCTYPE, when ingest, then FAILED cepat dengan pesan jelas tanpa RSS melampaui batas
- [ ] Given sheet > 1.048.576 baris, kolom > 16.384, sheet > 50, atau sel > 32.767 karakter, when ingest, then baris/kolom/sheet berlebih ditolak dengan pesan dan sel panjang dipotong + dihitung; job > 60 menit → FAILED

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:56:59Z Batas: byte terdekompresi ≤ 20× ukuran file; temp_directory + max_temp_directory_size; lock Redis memakai PX TTL + compare-and-delete.
- 2026-10-12T01:31:31Z Dari T-004: antrean 'ingest' jobId=versionId, data {versionId} (src/lib/queue/connection.ts). Worker entry src/worker/index.ts sudah ada (antrean maintenance); tambah processor ingest di sana. Saat start, sapu versi UPLOADED tanpa job (enqueue bisa gagal saat Redis mati, versi tetap UPLOADED). Objek sumber: raw/<datasetId>/<versionId>/source.<xlsx|csv>, Content-Type application/octet-stream.
- 2026-10-12T02:47:36Z Dari T-005 (ADR-0005): pakai scripts/bench/parser-sax.ts sebagai dasar parser produksi (pindahkan ke src/, pertahankan batas: entri ≤ 10k, total tak terkompresi ≤ 24 GiB, rasio > 200x ditolak, DOCTYPE ditolak, spill sst > 128 MB). Unduh objek sumber ke disk temp worker dulu (zip butuh akses acak; disk temp ≥ 2× ukuran file). Nomor baris dari atribut r (baris kosong tidak dipancarkan; _row fisik). CSV: DuckDB read_csv langsung ke Parquet dengan kolom eksplisit hasil sniff 64 KB (all_varchar, null_padding). Jangan pakai DuckDB read_xlsx (kolom hilang tanpa range, OOM di 1 GB) atau ExcelJS. Fixture: tests/fixtures/kecil.xlsx dkk + manifest untuk verifikasi per sel. Ekstensi DuckDB tidak dipakai untuk xlsx, jadi tidak perlu bundel ekstensi excel.
- 2026-10-12T02:59:52Z Koreksi setelah review T-005 (menggantikan angka di catatan sebelumnya): batas parser kini rasio per entri ≤ 100x, total tak terkompresi ≤ min(24 GiB, 100× ukuran file), entri tumpang tindih ditolak, ≤ 50 sheet, ≤ 1.048.576 baris, ≤ 16.384 kolom, sel > 32.767 karakter dipotong + dihitung (ParseSummary.truncatedCells), nomor baris wajib naik, opsi deadline. Lihat ADR-0005 bagian Parameter.
- 2026-10-12T03:21:39Z Dari review T-005 putaran 4: batch raw.parquet harus di-flush berdasarkan jumlah baris (50k) ATAU ukuran (mis. 64 MB teks), mana yang lebih dulu — satu baris sah bisa berisi sampai 4 juta karakter sehingga 50k baris tanpa batas byte bisa menghabiskan memori.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
