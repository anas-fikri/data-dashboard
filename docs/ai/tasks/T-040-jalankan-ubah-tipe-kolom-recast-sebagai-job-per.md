---
id: T-040
title: Jalankan ubah tipe kolom/recast sebagai job per segmen
status: done
profile: strict
goal: G-6
tags:
  - worker
  - schema
depends_on:
  - T-037
created: "2026-10-15T02:30:55Z"
updated: "2026-10-20T05:15:58Z"
closed: "2026-10-20T05:15:58Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c1c8b0aa5fad938d37d2afe59c41499e085bba4f
paths:
  - docs/catatan-kerja-claude.md
  - docs/flow-kerja.md
  - docs/panduan-developer.md
  - docs/runbook-deploy.md
  - playwright.config.ts
  - prisma/migrations/20261020110000_t040_segment_profile/migration.sql
  - prisma/schema.prisma
  - scripts/dev-segments.ts
  - src/components/schema/recast-banner.tsx
  - src/components/schema/use-recast.tsx
  - src/features/ingest/ingest.ts
  - src/features/ingest/mapping.ts
  - src/features/ingest/profile.ts
  - src/features/ingest/recast-input.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/repo.ts
  - src/features/ingest/typed.ts
  - src/features/schema/runtime.ts
  - src/features/schema/service.ts
  - src/lib/queue/connection.ts
  - src/lib/queue/versions.ts
  - src/worker/index.ts
  - tests/e2e/recast-segments.spec.ts
  - tests/features/backup/probe.test.ts
  - tests/features/ingest/profile.test.ts
  - tests/features/ingest/recast-fakes.ts
  - tests/features/ingest/recast.test.ts
  - tests/features/ingest/segments.test.ts
  - tests/features/schema/schema.test.ts
  - tests/scripts/fixtures.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T01:03:00Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-20T01:29:47Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 166317
    summary: |-
      …oneksi ditolak NAS"}
      {"level":40,"time":1792473259488,"service":"data-dashboard","host":"127.0.0.1","port":39823,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792473274214,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792473274236,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792473274240,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792473274253,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792473280922,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792473280945,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:86:23\n\n  83 \n  84 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  85   const [versions, refs] = await Promise.all([\n→ 86     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  162 passed | 1 skipped (163)
            Tests  2101 passed | 10 skipped (2111)
         Start at  05:13:03
         Duration  118.94s (tests 86%, import 12%, transform 3%)

          Isolate  163 workers spawned · ~139ms startup each (spawn + environment, per file)
                   at least ~7.39s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T05:15:03Z"
    tree: f900ce668d1318fe3789b02ae71d6646e6539264a2807cf23cf67a9879a994cc
  commits:
    - 17d81a7
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 27924c4
    - 27986dc
    - 2d7b316
    - 3602b55
    - 36afc9f
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4eea84c
    - 5101f51
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 6b3ee3f
    - "7187327"
    - 75cf456
    - "7824e56"
    - 7ae2840
    - 7af4484
    - "8570e80"
    - 8f8df38
    - 90e4e63
    - "9298e14"
    - 94d85a4
    - a019f8f
    - a03481c
    - a0e1646
    - acb27a6
    - af1994a
    - b0b99d8
    - b30aea5
    - b32d50d
    - b8e59ee
    - ba2efef
    - c1c8b0a
    - c2fd95c
    - ccd0a9a
    - ce26ca5
    - ce649d0
    - cf28ad3
    - d32a8ea
    - d557c9e
    - da46e35
    - e24e070
    - f197114
    - f54828c
    - f55d8d2
    - fc288cb
    - fc87996
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-20T05:15:16Z"
    passed: true
    tree: f900ce668d1318fe3789b02ae71d6646e6539264a2807cf23cf67a9879a994cc
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 832 packages
          End status: 250 dirs visited, 1527 inodes visited, 1 Extract calls, 167.972063ms elapsed, 167.972199ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-8, Fase 1. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given sheet 24 segmen, when pemilik mengubah tipe kolom, then job per segmen berjalan dengan prioritas di bawah ingest, progres 'Segmen 7 dari 24' tampil, dan revisi baru aktif atomik hanya setelah semua segmen selesai
- [x] Given worker mati di tengah recast, when worker hidup lagi, then segmen yang sudah selesai tidak diulang dan hasil akhir identik
- [x] Given versi lama berbagi segmen, when recast selesai, then typed revisi lama tetap utuh sehingga rollback tetap bisa
- [x] Given kolom tersembunyi baru ditambahkan, then segmen lama tidak di-cast ulang (diproyeksikan NULL)

## Risk
Impact:
- **Recast.** Seluruh koreksi skema tipe/format/baris judul kini memakai jalur baru. Sheet satu segmen (semua data produksi saat ini) diproses dengan alur yang sama, tetapi:
  - recast tanpa perubahan cast tidak lagi menulis file baru (revisi tetap naik);
  - file lama dibaca profilnya sekali pada recast pertama.
- **Ingest dan pemetaan:** ikut menyimpan profil raw (JSONB kecil, field ≠ 0) per file typed.
- **Antrean:** job recast kini berprioritas di bawah pemetaan. Selama ingest dataset lain berjalan atau pemetaan antre, job ditunda sebentar dan dilanjutkan dari titik lanjut ("yield").
- **UI:** banner koreksi skema menampilkan "Segmen k dari N" bila N ≥ 2.
- **Migrasi:** satu kolom JSONB nullable, tanpa pemindahan data.
- **Batasan baru:** sheet beberapa segmen tidak bisa memilih ulang baris judul (belum ada di produksi).

Security (STRIDE):
- **Tampering.** Masukan pengguna tetap divalidasi `parseRecastInput` di app dan worker. SQL baru hanya memakai posisi `Math.trunc` dan path `lit()`. Progres dari Redis divalidasi `recastProgressOf` sebelum dikirim ke UI.
- **Information disclosure.** Status polling tetap memeriksa kepemilikan sheet aktif; progres hanya berisi angka.
- **Denial of service.** Tenggat 20 menit per segmen. Penantian ingest dibatasi 15 menit per segmen, jadi recast tidak macet selamanya. File tertunda yang tidak pernah aktif disapu GC setelah 24 jam, atau dihapus langsung saat job berakhir tanpa aktif.
- **Repudiation.** Tidak berubah (log worker per job).

Rollback:
- Revert commit T-040.
- Kolom `SegmentTyped.profile` boleh dibiarkan (tidak dibaca kode lama) atau dibuang dengan migrasi turun.
- Baris SegmentTyped tertunda tanpa manifest disapu GC seperti revisi lama.
- Manifest yang sudah ditukar tetap valid untuk kode lama (satu segmen per sheet di produksi).

Validation:
- **Unit `recast.test.ts` (27 tes):**
  - AC1: 24 segmen, progres berurutan, swap sekali setelah 24 file tercatat dengan manifest lama utuh sampai swap, `float` diputuskan dari gabungan sehingga semua file DOUBLE, gagal di segmen 13 membuat revisi lama tetap aktif, menunggu ingest;
  - AC2: worker mati di segmen ke-4, lalu percobaan ulang hanya menulis 3 sisanya dan profil tidak dibaca ulang, hasil identik dengan run bersih;
  - AC3: file dan baris revisi lama utuh, gcPlan tidak menandai/menyapu, rollback membaca data lama;
  - AC4: kolom tersembunyi baru hanya di segmen terakhir, jadi hanya 1 unduh/unggah, segmen lama tetap tanpa c3, nullPct 0,75;
  - integritas: file yang dipakai ulang hilang → gagal tanpa aktivasi.
- **Uji mutasi:** 4 mutan (lewati resume, tulis semua, profil segmen pertama saja, tidak menghapus file tertunda) semuanya terdeteksi.
- **Unit lain:** profile.test (pack/unpack/merge/versi), schema.test (progres status), segments.test (rowBase).
- **Pemeriksaan penuh:** full unit 2111 lulus, aitk check lulus.
- **e2e:** recast-segments 1/1 (24 segmen, banner "Segmen k dari 24", file baru semuanya dibuat setelah ingest lain selesai, manifest revisi 2 sekaligus, count 480.000 baris), schema 7/7, ingest 4/4, mapping 4/4, versions 7/7.

## Notes
- **"Job per segmen" = satu job BullMQ per koreksi, mengerjakan segmen sebagai unit kerja.** Setiap segmen punya tenggat 20 menit sendiri, titik lanjut, dan progres. Alasannya: satu swap atomik dan satu lock per sheet tetap sederhana; flow parent/child BullMQ tidak dipakai.
- **Keputusan tipe dari gabungan profil raw semua segmen** (`SegmentTyped.profile`). Satu skema menghasilkan tipe fisik `c<pos>` yang sama di semua file, sehingga daftar `read_parquet` T-037 tetap sah.
  - Jumlah unik digabung sebagai perkiraan (shortcut di `profile.ts`, hanya untuk tampilan).
  - `PROFILE_VERSION` = hash SQL profil: SQL berubah membuat profil lama dihitung ulang dari raw.
- **Kontrak R21 dicek ulang:**
  - T-016: status polling recast tetap memeriksa kepemilikan sheet aktif; progres hanya angka.
  - T-017: ekspor membaca sumber lewat `sheetSource`/`withSegments` (T-037), tidak diubah.
- **Batasan yang diketahui:**
  - Review putaran 1 (claude-reviewer-subagent: 0 Critical/High, 3 Medium, 6 Low) sudah diperbaiki: M1 tidak mengalah pada ingest dataset yang sama; M2 "yield" melepas slot antrean, bukan tidur; M3 indeks sheet diperpanjang per segmen dan batas "busy" dihitung sejak mulai menunggu; L1 `dropTyped` lewat DELETE … RETURNING dan kunci kembar tidak dihapus (dicek di DB dev); L2 semua ordinal dicek saat swap; L5 lookup tertunda per segmen; L6a fixture memakai skema sheet. L3/L4 → task lanjutan; L6b selesai bersama M2 (progres hanya saat segmen benar-benar mulai).
  - Asumsi raw `c<pos>` = posisi kanonik ≤ `colCount` segmen. Pemetaan periode (T-055) perlu peta kolom per segmen bila urutan kolom file berbeda.
- **e2e AC2 (worker dibunuh) tidak dijalankan:** lock job BullMQ 5 menit membuat stalled baru terdeteksi setelah ≥ 5 menit. Perilaku resume diuji di unit dengan DuckDB sungguhan + uji mutasi.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — recast tetap di worker (proses terpisah) membaca/menulis parquet di storage + metadata PostgreSQL; tanpa komponen atau batas kepercayaan baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — enqueue recast tetap lewat Server Action skema yang sudah memeriksa pemilik (requireUser + ownerId); worker hanya memproses job dari antrean internal
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — input recast (override kolom) tetap divalidasi zod seperti sebelumnya; SQL DuckDB memakai identifier dari skema; DELETE … RETURNING di dropTyped memakai parameter binding Prisma ($queryRaw tagged template)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat per segmen dicatat pino dengan jobId/sheetId; pesan pengguna tetap umum ("job lain berjalan terlalu lama", batas waktu segmen)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak menambah data pribadi; file typed tertunda yang gagal dihapus (dropTyped) dan disapu GC segmen
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — satu recast per sheet (lock Redis + indeks diperpanjang per segmen); swap manifest atomik dalam satu transaksi dengan cek revisi dan semua ordinal; yield/busy dibatasi waktu (15/30 menit) sehingga job tidak menggantung
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — kunci typed dibentuk server dari rawKey + revisi + tag job, bukan dari masukan pengguna; tanpa unggahan baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak ada endpoint baru; progres recast dibaca lewat route progres yang sudah ada
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi/env baru; npm audit 0 kerentanan

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T05:15:03Z (166317 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 17d81a7, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 2d7b316, 3602b55, 36afc9f, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 59ec9a3, 6123427, 62ec216, 6b3ee3f, 7187327, 75cf456, 7824e56, 7ae2840, 7af4484, 8570e80, 8f8df38, 90e4e63, 9298e14, 94d85a4, a019f8f, a03481c, a0e1646, acb27a6, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, ba2efef, c1c8b0a, c2fd95c, ccd0a9a, ce26ca5, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, e24e070, f197114, f54828c, f55d8d2, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
