---
id: T-024
title: Uji performa 1 GB end-to-end dan batas sumber daya
status: in_progress
profile: standard
goal: G-5
depends_on:
  - T-023
  - T-015
  - T-017
created: "2026-10-11T14:45:09Z"
updated: "2026-10-17T06:46:08Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 851513b80917a865aed6e6d7fd2f7f7d3b285cfb
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 83455
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792219529331,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792219529354,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792219529356,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792219529363,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  127 passed (127)
            Tests  1736 passed (1736)
         Start at  13:45:11
         Duration  55.87s (tests 73%, import 20%, transform 7%)

          Isolate  127 workers spawned · ~262ms startup each (spawn + environment, per file)
                   at least ~3.44s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T06:46:08Z"
    tree: eb7415062e995579b062af955421faaaa82b0ee6801b3355ebd509554570936e
---

## Objective
npm run perf: fixture T-005 (xlsx 1 GB 3 sheet × 1 juta baris; csv 1 GB ≈ 8 juta baris) → upload → ingest → 10 widget → filter; ukur waktu, RSS, p95 query. Batas: kuota storage per user (USER_STORAGE_QUOTA_BYTES, dihitung dari ukuran versi di PostgreSQL), posisi antrean ingest di UI. Laporan docs/ai/perf/T-024.md.

## Acceptance criteria
- [ ] Given fixture 1 GB, when alur upload sampai dashboard 10 widget selesai di VM spek minimum, then total < 20 menit dan laporan waktu/RSS/p95 tersimpan di docs/ai/perf/T-024.md
- [ ] Given 5 upload bersamaan dari 5 user, when ingest berjalan, then maksimal 2 job aktif (2 worker × 1) dan sisanya menampilkan posisi antrean di UI
- [ ] Given user mencapai kuota storage, when initUpload, then code QUOTA_EXCEEDED dengan angka terpakai/limit

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-17 Dari T-029: dimensi teks kini GROUP BY lower(...) + label histogram() (variasi paling sering). Terukur 5 juta baris/4 juta kategori: 0,30 → 1,17 s (2 thread). Ukur di 1 GB/10 juta baris; bila p95 > 3 s, hitung label hanya untuk N kategori teratas (CTE LIMIT lalu semi-join label) — src/features/query/sql.ts textLabel.
- 2026-10-11T14:57:00Z AC kuota mencakup upload berjalan (versi UPLOADING).
- 2026-10-14T09:51:46Z Dari T-013: e2e schema.spec AC1 (ingest gagal di dalam sheet) kadang gagal di suite penuh (3 dari 7 putaran pada 2026-10-14) karena versi tertahan di 'Menyiapkan file' > 60 s — job ingest tidak diambil worker spec; lolos bila dijalankan sendiri. Akar belum tertangkap (log worker dengan pipa dikuras tidak mereproduksi). Kandidat: worker e2e dibunuh lewat SIGTERM ke npm saja (anak tsx bisa yatim) dan stderr tidak dikuras — satukan startWorker/stopWorker di tests/e2e/helpers.ts seperti versions.spec (detached + kill grup proses + kuras stdout/stderr ke log).
- 2026-10-14T11:12:14Z Update dari T-013: akar flake schema AC1 ditemukan & diperbaiki — bukan worker, tetapi balapan di halaman profil dataset: status versi dibaca 3x dalam satu render; bila ingest selesai di antaranya, IngestProgress menerima status awal yang sudah final dan usePolling tidak pernah memanggil onDone/router.refresh (panel 'diproses' basi). Kini usePolling memanggil onDone sekali saat data awal sudah final (finalInitial). Worker e2e kini lewat startWorker/stopWorker bersama di tests/e2e/helpers.ts (grup proses + log di tmpdir dd-e2e-worker-<nama>.log).
- 2026-10-15T17:49:12Z Dari review T-017 INT-R2-1: DuckDB job ekspor kini EXPORT_DUCKDB_MEMORY=768MB (512MB OOM pada sort penuh tabel lebar 1 juta baris ±16 kolom teks unik). Ukur memori gabungan proses worker saat ingest (1GB) + recast + ekspor berjalan bersamaan di profil VM T-023; bila melewati batas container, turunkan ke 512MB dan ganti ekspor tabel ke materialisasi bertahap (sort hanya kunci + _row, tulis per potongan).
- 2026-10-15T19:43:25Z Dari review T-017 putaran 5: ekspor CSV terurut tabel teks sangat panjang (±200 rb baris × 20 kolom × 250 karakter ≈ 1 GB teks) masih OOM di EXPORT_DUCKDB_MEMORY=768MB; XLSX lewat parquet kerja dengan row group sumber sudah lolos 150 rb baris. Ukur batas praktis di profil VM T-023 dan putuskan: naikkan memori ekspor, atau batas byte ekspor (EXPORT_TOO_LARGE berbasis ukuran).
