---
id: T-006
title: 'Worker ingest: raw.parquet posisional, header metadata, idempoten'
status: in_review
profile: strict
profile_pinned: true
goal: G-3
tags:
  - security
depends_on:
  - T-004
  - T-005
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T07:19:28Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 561f910b5d41b43569cc74d52a0f81a359ac32e4
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-12T05:44:44Z"
      findings: 13
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-12T07:17:56Z"
      findings: 2
    - "n": 3
      by: claude-security-reviewer-subagen
      at: "2026-10-12T07:17:56Z"
      findings: 1
evidence:
  audit:
    at: "2026-10-12T07:18:15Z"
    passed: true
    tree: a4690855c6d8d74b5c0fa465b34d2dfd40b72d377139f77ab26e97b7e1a764b3
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 715 packages
          End status: 96 dirs visited, 391 inodes visited, 1 Extract calls, 60.197125ms elapsed, 60.198ms wall time
          Loaded npm local db from /Users/anasfikri/Library/Caches/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Alur B3 tahap raw. Proses worker/ terpisah, BullMQ concurrency 1, DuckDB memory_limit 1GB + temp_directory. Stream dari MinIO, SHA-256 sambil jalan. CSV: sniff 64 KB (encoding UTF-8/Windows-1252, delimiter, quote). xlsx: verifikasi ZIP/workbook, sheet satu per satu dengan parser ADR-0002, sel tanggal → ISO. Batch 50k → raw.parquet kolom posisional c1..cN VARCHAR + _row, semua baris. Tiap batch cek dataset masih ada. Setelah sheet: tebak headerRow (heuristik ≥ 60% sel teks unik non-kosong), nama kolom unik deterministik (kosong → kolom_<pos>, duplikat → _2), nama asli disimpan. Progres per sheet (baris diproses, total perkiraan) ditulis ke versi tiap ≤ 5 detik. Error → hapus semua objek Parquet versi, FAILED + pesan sheet/baris. Job diulang → hapus objek versi dulu (idempoten). Lib bersama src/lib/duckdb (koneksi, baca Parquet lokal/S3, interrupt) dibangun di sini.

## Acceptance criteria
- [x] Given fixture xlsx 3 sheet dengan header di baris ke-4, header kosong dan duplikat, when ingest, then headerRow=4 tersimpan, kolom bernama unik deterministik dengan nama asli tersimpan, dan jumlah baris raw per sheet = baris data + baris di atas header
- [x] Given fixture csv Windows-1252 delimiter titik koma, when ingest, then encoding dan delimiter terdeteksi dan karakter aksen utuh di raw.parquet
- [x] Given job dibunuh di tengah lalu diulang BullMQ, when job kedua selesai, then objek Parquet versi identik dengan ingest tanpa gangguan dan tidak ada objek parsial tersisa
- [x] Given dataset dihapus saat ingest berjalan, when batch berikutnya diproses, then worker berhenti dan objek versi dihapus
- [x] Given file xlsx rusak di tengah, when ingest gagal, then versi FAILED dengan pesan sheet/baris dan tidak ada objek Parquet versi tersisa
- [x] Given fixture xlsx 1 GB (perf), when ingest penuh, then selesai < 15 menit dengan puncak RSS < 2 GB; bukti di docs/ai/perf/T-006.md
- [x] Given fixture zip-bomb kecil (rasio > 20×) atau xlsx dengan <!DOCTYPE, when ingest, then FAILED cepat dengan pesan jelas tanpa RSS melampaui batas
- [x] Given sheet > 1.048.576 baris, kolom > 16.384, sheet > 50, atau sel > 32.767 karakter, when ingest, then baris/kolom/sheet berlebih ditolak dengan pesan dan sel panjang dipotong + dihitung; job > 60 menit → FAILED

## Risk
Risk level: HIGH. Worker memproses file tak tepercaya sampai 1 GB dengan akses storage dan DB; salah penanganan berarti DoS worker, objek yatim, atau versi tersangkut.

Impact surface:
- **Data:** prisma Sheet + DatasetVersion.ingestStartedAt/ingestStage/progress (migrasi ingest_sheet).
- **Pipeline:** src/features/ingest/* (ingest, csv, csv-sniff, header, raw-writer, repo), src/lib/duckdb, src/lib/storage/files.ts, src/lib/xlsx (parser dipindah dari scripts/bench + drain/onSheet/onProgress).
- **Worker:** antrean ingest, sapuan UPLOADED, penanganan gagal di percobaan terakhir.
- **Env dan skrip:** env WORKER_TMP_DIR, scripts/perf-ingest.ts, dev-upload-fixture "ingest".

Security (STRIDE):
- **DoS:**
  - File xlsx dibatasi seperti parser ADR-0005 (memori < ~500 MB; zip, XML, sel, baris, kolom, sheet).
  - CSV dibatasi: kolom ≤ 16.384, baris kosong ≤ 1 juta, max_line_size 8 MB, sel > 32.767 dipotong.
  - DuckDB dibatasi memory_limit 1 GB, temp ≤ 8 GB, threads 2.
  - Deadline 60 menit per percobaan, dengan watchdog interrupt untuk query panjang.
  - Concurrency 1 per proses; antrean ≤ satu potongan stream (drain).
- **Tampering:** isi file tidak pernah dieksekusi. Nama kolom hanya disimpan sebagai metadata dan dikutip saat dipakai SQL. Path DuckDB dibuat program, sedangkan nilai user lewat parameter binding.
- **Information disclosure:** pesan FAILED hanya menyebut sheet, baris, dan jenis masalah, tanpa path internal. Objek Parquet hanya di prefix versi, tanpa presigned GET.
- **Repudiation:** log terstruktur jobId/versionId/attempt.
- **Elevation:** worker tidak menerima input user selain versionId dari antrean, dan versi dibaca dari DB.

Compatibility: status versi tetap INGESTING dengan ingestStage "raw" sampai T-007 menulis typed dan READY. Label UI "Memproses" tetap benar.

Failure modes:
- **Worker mati atau diulang:** percobaan berikutnya menghapus prefix Parquet versi dan Sheet dulu, sehingga hasilnya identik (Parquet deterministik, diuji).
- **Dataset dihapus di tengah:** dicek tiap batch, saat watchdog, dan setelah unggah; worker berhenti lalu prefix dihapus.
- **Gagal permanen:** versi FAILED, prefix dan Sheet dihapus.
- **Gagal sementara:** BullMQ mengulang (3×). Bila percobaan terakhir gagal, versi FAILED dengan pesan umum.
- **Enqueue sempat gagal:** worker menyapu versi UPLOADED tanpa job saat start.

Rollback: revert commit dan drop migrasi ingest_sheet (kolom baru nullable, tabel Sheet baru); worker lama tidak memproses antrean ingest.

Validation:
- **Unit:**
  - header, nama kolom, sniff, pemindai, raw text;
  - ingest end-to-end in-process (25 test): 3 sheet header baris 4, Windows-1252, BOM, RFC 4180, UTF-16 ditolak, crash lalu ulang identik, upload putus lalu ulang identik, dataset dihapus saat batch dan saat unggah, xlsx rusak di tengah, zip-bomb, DOCTYPE, batas baris, deadline, sel panjang xlsx/csv.
- **e2e worker sungguhan:** xlsx 3 sheet, CSV Windows-1252, DOCTYPE dengan pesan di halaman.
- **Perf:** docs/ai/perf/T-006.md (xlsx 1 GB 324 s / 884 MB; csv 1 GB 50 s / 1.066 MB).

Open risks/assumptions:
- Transfer jaringan 1 GB tidak diukur di sini (T-024).
- Batas rasio zip 100x (ADR-0005) lebih longgar dari catatan awal "20×"; fixture zip-bomb (117x) tetap ditolak cepat.
- UI progres per sheet dibangun di T-008 (data progress sudah tersimpan tiap ≤ 5 detik).

## Notes
- 2026-10-11T14:56:59Z Batas: byte terdekompresi ≤ 20× ukuran file; temp_directory + max_temp_directory_size; lock Redis memakai PX TTL + compare-and-delete.
- 2026-10-12T01:31:31Z Dari T-004: antrean 'ingest' jobId=versionId, data {versionId} (src/lib/queue/connection.ts). Worker entry src/worker/index.ts sudah ada (antrean maintenance); tambah processor ingest di sana. Saat start, sapu versi UPLOADED tanpa job (enqueue bisa gagal saat Redis mati, versi tetap UPLOADED). Objek sumber: raw/<datasetId>/<versionId>/source.<xlsx|csv>, Content-Type application/octet-stream.
- 2026-10-12T02:47:36Z Dari T-005 (ADR-0005): pakai scripts/bench/parser-sax.ts sebagai dasar parser produksi (pindahkan ke src/, pertahankan batas: entri ≤ 10k, total tak terkompresi ≤ 24 GiB, rasio > 200x ditolak, DOCTYPE ditolak, spill sst > 128 MB). Unduh objek sumber ke disk temp worker dulu (zip butuh akses acak; disk temp ≥ 2× ukuran file). Nomor baris dari atribut r (baris kosong tidak dipancarkan; _row fisik). CSV: DuckDB read_csv langsung ke Parquet dengan kolom eksplisit hasil sniff 64 KB (all_varchar, null_padding). Jangan pakai DuckDB read_xlsx (kolom hilang tanpa range, OOM di 1 GB) atau ExcelJS. Fixture: tests/fixtures/kecil.xlsx dkk + manifest untuk verifikasi per sel. Ekstensi DuckDB tidak dipakai untuk xlsx, jadi tidak perlu bundel ekstensi excel.
- 2026-10-12T02:59:52Z Koreksi setelah review T-005 (menggantikan angka di catatan sebelumnya): batas parser kini rasio per entri ≤ 100x, total tak terkompresi ≤ min(24 GiB, 100× ukuran file), entri tumpang tindih ditolak, ≤ 50 sheet, ≤ 1.048.576 baris, ≤ 16.384 kolom, sel > 32.767 karakter dipotong + dihitung (ParseSummary.truncatedCells), nomor baris wajib naik, opsi deadline. Lihat ADR-0005 bagian Parameter.
- 2026-10-12T03:21:39Z Dari review T-005 putaran 4: batch raw.parquet harus di-flush berdasarkan jumlah baris (50k) ATAU ukuran (mis. 64 MB teks), mana yang lebih dulu — satu baris sah bisa berisi sampai 4 juta karakter sehingga 50k baris tanpa batas byte bisa menghabiskan memori.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = file unggahan (tak tepercaya) → worker terpisah dari app; worker hanya menerima versionId dari antrean, data versi dibaca dari DB; direktori kerja per job di WORKER_TMP_DIR
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: worker tanpa endpoint/autentikasi user; kredensial DB/Redis/S3 dari env
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: tidak ada input user selain versionId antrean; objek hanya ditulis ke prefix parquet/<datasetId>/<versionId>/ milik versi itu
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: isi file tidak dieksekusi; SQL DuckDB memakai parameter binding untuk path/delimiter, identifier dibuat program dan dikutip; nama kolom user hanya metadata JSON
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis baru (SHA-256 isi file untuk integritas)
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: pesan FAILED menyebut sheet/baris/jenis masalah tanpa path internal; log pino jobId/versionId/attempt
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: gagal/dataset dihapus → prefix parquet versi + metadata Sheet dihapus (hapus gagal → StorageCleanup); datasetId ikut di data job; direktori temp dihapus di finally, sisa worker mati dihapus saat start
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: komunikasi ke storage/DB/Redis internal (TLS produksi di T-023)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru di T-006; ekstensi DuckDB tidak di-autoload/diunduh saat runtime
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: concurrency 1 per worker, job idempoten (bersih dulu, Parquet deterministik), sapuan UPLOADED tanpa job, gagal sementara diulang 3× lalu FAILED (status job sebagai sumber kebenaran, termasuk stalled) + bersih; penyapu INGESTING macet tiap 15 menit
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — diverifikasi: batas parser ADR-0005; kolom raw ≤ 2.048 (xlsx dan CSV), baris kosong CSV ≤ 1 juta, max_line_size 8 MB, sel dipotong 32.767; DuckDB memory_limit 1 GB + temp ≤ 8 GB, tanpa operator lebar yang OOM (test 1.000/1.100 kolom di 256 MB); deadline 60 menit + watchdog interrupt di semua query panjang; xlsx rusak/zip-bomb/DOCTYPE → FAILED (test)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: WORKER_TMP_DIR terdokumentasi (butuh upload + 8 GiB), autoinstall/autoload ekstensi DuckDB dimatikan, perf terpisah dari check
