---
id: T-de1b
title: Parse sheet xlsx paralel saat ingest
status: todo
profile: standard
created: "2026-10-17T10:12:35Z"
updated: "2026-10-17T13:40:45Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T12:38:55Z"
      findings: 9
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T12:38:56Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given xlsx dengan beberapa sheet besar, when ingest berjalan di worker, then sheet dibaca paralel (dibatasi jumlah thread yang bisa diatur) dan total waktu baca lebih kecil daripada baca berurutan pada fixture perf yang sama
- [x] Given batas memori worker 3 GB, when xlsx 1 GB 3 sheet di-ingest paralel, then worker tidak OOM dan hasil kolom/tipe sama persis dengan baca berurutan

## Risk
- Impact: ingest xlsx di worker: file ≥ 2 sheet dengan XML ≥ 16 MiB dibaca paralel oleh worker thread (INGEST_XLSX_SHEET_THREADS 1–4, bawaan 2; 1 = jalur berurutan lama tanpa perubahan); penulisan tetap satu koneksi DuckDB berurutan sehingga keluaran identik byte; heap worker dibatasi 256 MB; worker gagal start sebelum baris pertama → jalur berurutan otomatis. Puncak RSS naik ± 150–330 MB.
- Security (STRIDE): DoS — batas zip-bomb dan penolakan DOCTYPE SAX dijalankan ulang di tiap worker; antrean batch terbatas (≤ 4 belum diakui, batas baris/sel/karakter); heap worker 256 MB, OOM worker = gagal permanen 'File terlalu berat' (tidak diulang); jumlah thread dibatasi 4 + anggaran CPU terdokumentasi. Tampering — jalur file spill dari mkdtemp, bukan input pengguna; tidak ada permukaan input baru.
- Rollback: set INGEST_XLSX_SHEET_THREADS=1 (tanpa deploy ulang kode) atau revert commit T-de1b; tidak ada migrasi.
- Validation: vitest parallel (identik 1 vs 3 thread untuk sharedStrings memori & spill, string multibyte lintas halaman, urutan workbook, progres monoton, galat satu sheet menghentikan semua, penulis gagal, dataset terhapus, fallback worker gagal start, OOM worker permanen) + suite parser/ingest berurutan; 1 GB 3 sheet di M4: digest identik 1 vs 2 thread, baca 241,7 s vs 304,7 s, puncak RSS 764 vs 615 MB (docs/ai/perf/T-de1b.md); review 2 putaran (9 → 0).

## Notes
- 2026-10-17T12:38:56Z AC1 terukur di Apple M4 (3×200k×30 & 3×100k): baca 25–45% lebih cepat dengan 2 thread, digest raw/typed parquet + skema identik dengan berurutan. AC2 (1 GB 3 sheet tanpa OOM di 3 GB) belum diukur: perlu perf-ingest pada fixture 1 GB dengan sheetThreads=2 + /usr/bin/time -l (footprint ≤ ~2 GB = bukti; 2–2,6 GB → konfirmasi docker --memory=3g di olympus). Disk Mac 98% penuh; olympus sedang macet.
- 2026-10-17T13:40:44Z AC2 diukur: 1 GB 3 sheet (903 MB) di M4, threads=2 selesai tanpa OOM, puncak RSS 764 MB (time -l 800 MB) jauh di bawah 3 GB; digest identik dengan threads=1 (dfd875fa…). docs/ai/perf/T-de1b.md.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tetap: file unggahan pengguna → worker ingest; kini thread utama + worker thread dalam proses yang sama, data dibagi lewat SharedArrayBuffer/file spill di direktori kerja job
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: ingest tetap dipicu job antrean yang sudah diotorisasi; tidak ada endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — setiap worker menjalankan ulang listEntries dengan batas zip-bomb dan guard SAX yang menolak DOCTYPE; batas baris/sel/karakter batch; RowTooLargeError tetap berlaku
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat pertama menghentikan semua worker, menunggu langkah DuckDB, menutup penulis, lalu dilempar ulang dengan nama sheet; fallback ke jalur berurutan dicatat warn sekali per file; pesan pengguna tetap pesan ingest yang ada
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — file spill sharedStrings di mkdtemp direktori kerja job, dihapus di finally dan oleh runIngest
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru (worker_threads bawaan Node); npm audit + osv-scanner 0 temuan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — keluaran identik byte dengan jalur berurutan (digest 1 GB sama); urutan workbook dan progres monoton; fallback hanya bila belum ada baris tertulis
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — heap worker 256 MB (OOM = gagal permanen 'File terlalu berat'), antrean batch ≤ 4 belum diakui, thread ≤ 4, puncak 1 GB 3 sheet ± 0,8 GB RSS
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — INGEST_XLSX_SHEET_THREADS 1–4 bawaan 2 (zod di env.ts, .env.example, docker-compose.prod.yml) dengan anggaran CPU terdokumentasi; nilai 1 = jalur lama
