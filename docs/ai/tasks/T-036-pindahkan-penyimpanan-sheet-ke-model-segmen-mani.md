---
id: T-036
title: Pindahkan penyimpanan sheet ke model segmen + manifest versi lewat migrasi metadata
status: in_review
profile: strict
profile_pinned: true
goal: G-6
tags:
  - data-model
  - migration
depends_on:
  - T-034
  - T-033
created: "2026-10-15T02:30:55Z"
updated: "2026-10-19T14:29:31Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 49f49a53fcf2ac88b037cb8316e801c0afbc0d35
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T14:26:25Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-19T14:26:26Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 138362
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792420071786,"service":"data-dashboard","host":"127.0.0.1","port":50131,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792420071794,"service":"data-dashboard","host":"127.0.0.1","port":50140,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792420071830,"service":"data-dashboard","host":"127.0.0.1","port":50142,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792420071851,"service":"data-dashboard","host":"127.0.0.1","port":50146,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792420079965,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792420079988,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792420079991,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792420080020,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792420089028,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  154 passed (154)
            Tests  2009 passed (2009)
         Start at  21:27:31
         Duration  90.12s (tests 79%, import 17%, transform 4%)

          Isolate  154 workers spawned · ~298ms startup each (spawn + environment, per file)
                   at least ~4.80s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T14:29:05Z"
    tree: c2ea5fcf0d0d9815d6f50d422f33851096a6922de6dafd4bb165428978326ee0
  audit:
    at: "2026-10-19T14:29:06Z"
    passed: true
    tree: c2ea5fcf0d0d9815d6f50d422f33851096a6922de6dafd4bb165428978326ee0
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 832 packages
          End status: 212 dirs visited, 1425 inodes visited, 1 Extract calls, 216.320209ms elapsed, 216.323ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-4, Fase 1. Perkiraan 4–5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given database berisi dataset lama, when migrasi berjalan, then setiap Sheet punya tepat satu segmen legacy (rowBase 0) yang merujuk rawKey/typedKey lamanya tanpa objek disalin, dan seluruh test + e2e lolos tanpa perubahan
- [x] Given segmen baru ditulis, then typed memuat c<pos> kanonik, _row BIGINT = rowBase + baris fisik (unik per sheet logis, tidak pernah dipakai ulang, sama di setiap recast), dan _src_row, sementara SheetLineage.rowHighWater naik atomik
- [x] Given REPLACE, rollback, atau aktivasi dengan sheetMap, then lineageId terbawa ke sheet versi baru

## Risk
- Impact: migrasi DB 20261019140000_t036_segments (4 tabel baru + Sheet.lineageId NOT NULL, backfill dari Sheet yang ada); ingest/recast/pemetaan menulis metadata segmen + manifest dalam transaksi yang sama dengan pointer typedKey; typed baru BIGINT `_row` + `_src_row`. Pembaca (query, widget, ekspor, skema) tetap memakai Sheet.typedKey; sampel skema menampilkan `_src_row`. Lokasi file segmen tetap di prefix versi sampai T-038 (retensi/cleanup per prefix tetap benar).
- Security (STRIDE): Tampering/integritas — `_row` unik per sheet logis lewat increment atomik (UPDATE … SET rowHighWater = rowHighWater + n) sehingga late materialization `_row IN ids` tidak pernah tercampur; rowBase literal program (BigInt ≥ 0, dicek), tanpa input user di SQL; manifest → file typed ON DELETE NO ACTION (file typed yang dirujuk tidak bisa terhapus diam-diam). Information disclosure — tidak ada jalur baca baru; otorisasi tetap sama. DoS — query max(_row) dari statistik parquet (murah).
- Rollback: migrasi hanya menambah (tabel + kolom); kode lama mengabaikannya, jadi rollback = deploy image sebelumnya (prev-<stamp>); typed BIGINT `_row` + `_src_row` tetap terbaca kode lama (kolom eksplisit, `_row` hanya untuk urutan/late materialization). Bila perlu, tabel baru bisa di-DROP setelah rollback. Backup DB sebelum deploy (runbook §6).
- Validation: migrasi diterapkan ke DB dev 359 sheet + scripts/check-segments.mjs (satu segmen legacy per sheet di versinya dengan rawKey sama, manifest = typedKey, lineage satu dataset, rowBase legacy 0: semua 0 selisih) + prisma migrate diff kosong; uji unit segments.test.ts (rowBase 0 versi pertama, refresh membawa lineage + rowBase = high-water lama, recast _row identik), mapping.test.ts (pemetaan user membawa lineage + rowBase baru), schema.test.ts (sampel `_src_row`), vitest penuh 2009 tes; e2e ingest/schema/versions/mapping.

## Notes
- Keputusan bertahap: file segmen baru tetap di prefix versi (parquet/<ds>/<ver>/<sheet>/) sampai T-038 memindahkannya ke parquet/<ds>/seg/<id>/ bersama GC mark-and-sweep — retensi/cleanup per prefix dan regex kunci objek tetap benar, tidak ada objek yatim.
- T-038 perlu tahu: hapus Dataset bergantung urutan trigger cascade (SheetLineage/DatasetVersion sebelum Segment_datasetId) karena SheetSegment→SegmentTyped ON DELETE NO ACTION; sebelum segmen dipakai bersama lintas versi, pertimbangkan FK DEFERRABLE atau aksi lain. Baris SheetLineage/SegmentTyped yatim (ingest diulang, recast) menunggu GC T-038.
- Pemeriksa migrasi: node --env-file=.env scripts/check-segments.mjs (dipakai juga di produksi setelah migrate).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — metadata segmen (SheetLineage/Segment/SegmentTyped/SheetSegment) di PostgreSQL yang sama, ditulis hanya oleh worker (ingest/recast/pemetaan) di transaksi yang sama dengan pointer typedKey; pembaca tidak berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A untuk jalur baru — tidak ada endpoint/aksi baru; otorisasi query/sampel tetap (sheet di-resolve dari versi aktif dataset milik/terbagi user)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — rowBase BigInt ≥ 0 dari DB (dicek, ditulis sebagai literal program), path parquet via lit(); tidak ada input user di SQL baru; migrasi hanya SQL statis
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — sheet tanpa segmen → galat eksplisit (fail-closed), versi/dataset hilang → DatasetGoneError seperti sebelumnya; tidak ada log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — tidak ada data pribadi baru; metadata hanya kunci objek, jumlah baris, rowBase
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — `_row` unik per sheet logis lewat increment atomik rowHighWater (tidak pernah dipakai ulang, juga saat ingest diulang); lineage legacy mulai 2^31 − 1 di atas `_row INTEGER` lama; manifest → file typed ON DELETE NO ACTION mencegah file yang dirujuk terhapus diam-diam
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — lokasi objek tidak berubah (prefix versi), regex kunci objek dan cleanup per prefix tetap berlaku; max(_row) dari statistik parquet lokal
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa env baru; migrasi aditif (tabel + kolom), npm audit 0 kerentanan
