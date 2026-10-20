---
id: T-049
title: 'Siapkan model data periode: mode versi, status AWAITING_CONFIRM, kolom _period, dan aturan beku'
status: in_progress
profile: strict
profile_pinned: true
goal: G-6
tags:
  - data-model
  - data-integrity
  - migration
depends_on:
  - T-038
  - T-040
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T11:07:41Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: ca5782fc8f851ac1357dfbf75b9ec7626edc1639
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 183230
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792494337709,"service":"data-dashboard","host":"127.0.0.1","port":34751,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792494337767,"service":"data-dashboard","host":"127.0.0.1","port":37613,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792494337872,"service":"data-dashboard","host":"127.0.0.1","port":43419,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792494337977,"service":"data-dashboard","host":"127.0.0.1","port":41869,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792494349401,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792494356694,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792494356716,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792494356720,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792494356732,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  173 passed | 1 skipped (174)
            Tests  2248 passed | 10 skipped (2258)
         Start at  11:04:24
         Duration  131.22s (tests 84%, import 13%, transform 3%)

          Isolate  174 workers spawned · ~154ms startup each (spawn + environment, per file)
                   at least ~8.75s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T11:06:37Z"
    tree: 66ead7ee1f2c2edf7297e21d59e8f0add19f1d1d7d19f53ae2df603da6b8c5b7
  audit:
    at: "2026-10-20T11:06:41Z"
    passed: true
    tree: 66ead7ee1f2c2edf7297e21d59e8f0add19f1d1d7d19f53ae2df603da6b8c5b7
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 472 dirs visited, 2450 inodes visited, 1 Extract calls, 200.806728ms elapsed, 200.806994ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-17, Fase 3 (§4.3 model data, §4.4 aturan beku, gerbang integritas). Siapkan fondasi data per periode tanpa mengubah perilaku dataset yang ada:
- Migrasi aditif yang aman di produksi: `VersionMode` = REPLACE/PERIOD/PERIOD_SETUP/PERIOD_REMOVE/PERIOD_RESTORE (APPEND dihapus; migrasi berhenti dengan pesan bila ada barisnya), status non-terminal `AWAITING_CONFIRM`, `DatasetVersion.periodGrain`, `Sheet.periodSource/periodColumn`, `Segment.periodKey/periodStart/minDate/maxDate/sha256/originalName/sourceKind` (diisi dari versi pembuat).
- `AWAITING_CONFIRM` ikut semua daftar non-terminal (unggahan, rollback, retensi file asli, label/badge, buang versi).
- `_period DATE` di typed segmen periode = `Segment.periodStart` (dibekukan saat unggah), ditulis ulang dari metadata saat recast; aturan beku (judul, tipe/format kolom periode) di app dan worker.
- `verifyVersionIntegrity` + `typedFileProblems` memeriksa periode (NULL, jumlah baris per periode, periode ganda, satuan).
Di luar cakupan (task lanjutan): pengaturan dataset `keepPeriods/onLimit/missingDatePolicy` (T-051), `baseVersionId/plan/changeSummary` versi (T-050/T-052), alur unggah periode dan layar tinjauan (T-052/T-053), proyeksi `_period` di query skema campuran (T-058).

## Acceptance criteria
- [x] Given migrasi, then VersionMode = REPLACE/PERIOD/PERIOD_SETUP/PERIOD_REMOVE/PERIOD_RESTORE (migrasi gagal dengan pesan bila ada baris APPEND); AWAITING_CONFIRM masuk semua daftar non-terminal dan peta label (memblokir unggahan dan rollback seperti AWAITING_MAPPING); Segment punya periodKey, periodStart, minDate/maxDate, sha256, originalName, dan sourceKind
- [x] Given dataset non-periode, when ingest, recast, mapping, dan query berjalan, then layout parquet dan hasil identik dengan sebelumnya (tanpa _period, test lama lolos)
- [x] Given versi periode, then periodGrain/periodSource tersimpan di versi/sheet (bukan dataset), _period tertulis di typed segmen dan bertahan saat recast, sedangkan ubah tipe/format kolom periode dan pilih ulang header ditolak dengan pesan
- [x] Given verifyVersionIntegrity pada versi periode, then pemeriksaan juga mencakup _period NULL di baris data dan kesesuaian jumlah baris per periode dengan metadata

## Risk
- Impact: migrasi berjalan di data produksi. Semua kolom baru nullable (data lama = non-periode); satu-satunya perubahan non-aditif adalah tipe enum `VersionMode` (ALTER COLUMN TYPE menulis ulang tabel `DatasetVersion` — kecil, lock singkat) dan nilai enum baru `AWAITING_CONFIRM`. Layout parquet dataset non-periode tidak berubah (tanpa `_period`). Status baru belum pernah ditulis kode di task ini (penulisnya T-052), jadi perilaku runtime saat ini sama.
- Security (STRIDE): Tampering — `_period` hanya dari metadata segmen, literal tanggal divalidasi `isIsoDate` sebelum masuk SQL (bukan input user); aturan beku dijaga di server (app + worker). Elevation/Info disclosure — tidak ada endpoint baru; buang versi AWAITING_CONFIRM memakai otorisasi pemilik yang sama (lock Dataset milik user, NOT_FOUND). Repudiation/DoS — N/A, tidak ada jalur baru yang bisa dipicu user selain penolakan cepat.
- Rollback: kode lama tidak mengenal AWAITING_CONFIRM/mode baru tetapi tidak ada baris yang memakainya sampai T-052; rollback kode saja aman. Rollback skema (hanya bila belum ada data periode): lihat Notes "Rollback migrasi".
- Validation: uji migrasi pada salinan data dev (APPEND → gagal dengan pesan, transaksi dibatalkan; setelah diperbaiki → lulus, backfill benar, CHECK menolak data rusak); unit (period, typed, integrity, recast, schema, label, versions); e2e ingest/schema/recast-segments/versions/mapping.

## Notes
- Keputusan/asumsi (keputusan standar yang aman, bisa diubah pemilik):
  - `Sheet.periodColumn` = posisi kanonik `c<pos>` (stabil antarversi satu silsilah, ADR-0008), bukan judul+ordinal; T-051 me-resolve judul → posisi saat "Atur periode".
  - `_period` = `Segment.periodStart` konstan per segmen (satu segmen = satu periode, §4.3). Satu periode lebih dari satu segmen per sheet ditolak gerbang integritas (P-28 opsional harus melonggarkannya dengan sadar).
  - `minDate/maxDate` TIMESTAMP(6) naive (kolom periode bisa date atau timestamp); `periodStart` DATE.
  - `sourceKind` hanya "xlsx"|"csv" (CHECK di DB); locale angka tetap per kolom di skema (bukan per segmen).
  - Segmen baru (ingest REPLACE) kini juga mencatat `sha256`, `sourceKind`, `originalName`.
  - Buang versi (`discardVersion`) menerima AWAITING_CONFIRM ("Batalkan upload"); tombol UI-nya bagian T-052/T-053. `canDiscard` di riwayat tetap hanya AWAITING_MAPPING (panel pemetaan memakainya). Pembuangan otomatis 7 hari untuk AWAITING_CONFIRM = T-052/T-053.
  - Pemeriksaan isi file (`_period` NULL, baris per periode = metadata) di `typedFileProblems` saat file ditulis (ingest/recast), konsisten dengan desain T-038; `verifyVersionIntegrity` memeriksa metadata periode (sumber, kunci vs satuan, ganda, dataRows tercatat) dan menolak segmen berperiode di versi non-periode.
- Untuk T-057: pemetaan kolom (map-version) belum menulis `_period`; versi periode AWAITING_MAPPING harus memakai copyTyped({period}) + typedFileProblems(period) dan memperbarui dataRows manifest.
- Deploy: kode baru wajib berjalan dengan Prisma client hasil `prisma generate` skema ini (image produksi membangkitkannya saat build). Kode lama tetap aman di atas DB yang sudah dimigrasi selama belum ada baris AWAITING_CONFIRM/mode periode. Di dev: `next dev` yang menyala sebelum `prisma generate` memakai client lama → query daftar non-terminal menolak AWAITING_CONFIRM dan unggahan gagal; restart dev server.
- Untuk task lanjutan: `withSegments` (query/source.ts) proyeksi skema campuran belum membawa `_period` (daftar polos sudah) — T-058/T-052 wajib menambahkannya; grid `PREVIEW_STATUSES` (T-041) kini cocok dengan status nyata. T-052/T-055 wajib memvalidasi `colMap` (catatan T-gcn8) dan mengisi periodKey/periodStart/minDate/maxDate.
- Pra-deploy (produksi, setelah backup DB): `SELECT count(*) FROM "DatasetVersion" WHERE mode::text = 'APPEND';` harus 0 (kode tidak pernah menulis APPEND). Bila > 0 migrasi berhenti dengan pesan dan transaksi dibatalkan (tidak ada perubahan); putuskan versi itu dulu.
- Rollback migrasi (hanya selama belum ada versi/segmen periode; cek `SELECT count(*) FROM "DatasetVersion" WHERE mode <> 'REPLACE' OR status = 'AWAITING_CONFIRM' OR "periodGrain" IS NOT NULL;` = 0), dalam satu transaksi:
  `ALTER TABLE "Segment" DROP CONSTRAINT "Segment_period_pair_check", DROP CONSTRAINT "Segment_sourceKind_check", DROP COLUMN "periodKey", DROP COLUMN "periodStart", DROP COLUMN "minDate", DROP COLUMN "maxDate", DROP COLUMN "sha256", DROP COLUMN "originalName", DROP COLUMN "sourceKind"; ALTER TABLE "Sheet" DROP COLUMN "periodSource", DROP COLUMN "periodColumn"; ALTER TABLE "DatasetVersion" DROP COLUMN "periodGrain"; DROP TYPE "PeriodGrain"; DROP TYPE "PeriodSource";` lalu VersionMode kembali ke (REPLACE, APPEND) dengan pola rename-type yang sama, lalu `DELETE FROM _prisma_migrations WHERE migration_name = '20261020170000_t049_period_model';`. Nilai enum `AWAITING_CONFIRM` tidak bisa dihapus PostgreSQL tanpa membuat ulang tipe `VersionStatus`; membiarkannya tidak berbahaya untuk kode lama (tidak ada baris yang memakainya).
- Uji migrasi (dev, 2026-10-20): basis data baru + semua migrasi sebelum T-049 + baris contoh (versi xlsx, csv, satu APPEND, segmen tanpa versi pembuat). Hasil: dengan APPEND → `ERROR: T-049: 1 versi dataset ber-mode APPEND …`, mode tetap APPEND (transaksi batal); setelah diubah ke REPLACE → lulus, segmen xlsx/csv terisi sha256/originalName/sourceKind benar, segmen tanpa versi tetap null, enum baru benar, CHECK `Segment_period_pair_check` menolak periodKey tanpa periodStart. `prisma migrate diff` migrasi ↔ schema: tanpa selisih. Uji DB nyata sementara: prismaManifest/loadSheet membaca periode, CHECK sourceKind menolak "pdf".
- Bukti (2026-10-20): `aitk check` lulus (unit 2248); tes baru: period.test.ts (10), recast "data periode (T-049)" (6), integrity "versi periode" (3), schema "aturan beku" (2), label/status/service/retention + render badge/baris. e2e terarah: ingest 4/4, schema 7/7, recast-segments 1/1, versions 7/7, mapping 4/4 (percobaan pertama 1 gagal: job pemetaan AC3 tidak pernah masuk antrean di bawah beban — log worker hanya 2 "pemetaan selesai"; ulang tunggal lulus 4/4 dalam 1,5 menit). Percobaan e2e sebelumnya gagal karena `next dev` lama (Prisma client sebelum generate) — lihat catatan Deploy.
- UI: hanya label/badge "Menunggu konfirmasi" (IconChecklist, nada warning sama dengan pemetaan); plugin frontend-expert tidak tersedia di sesi cloud ini — /frontend-expert:audit belum dijalankan untuk dua baris badge ini.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — tanpa komponen/batas kepercayaan baru; aturan beku dijaga di app (requestRecast) dan worker (recast)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — tidak ada endpoint baru; buang versi AWAITING_CONFIRM lewat discardVersion yang sama (lock Dataset milik user, selain itu NOT_FOUND)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — awal periode masuk SQL hanya sebagai DATE literal setelah isIsoDate (uji injeksi di period.test.ts); input recast tetap parseRecastInput; CHECK DB untuk sourceKind dan pasangan periodKey/periodStart
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: sha256 segmen = sidik file (bukan rahasia), disalin dari versi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan baru Bahasa Indonesia tanpa detail internal; pesan integritas memakai label sheet/periode saja
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: originalName segmen = nama file yang sudah tersimpan di versi; ikut terhapus bersama dataset (cascade)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — AWAITING_CONFIRM ikut daftar non-terminal (satu versi tertunda per dataset, unggahan/rollback ditolak); recast tidak bisa memindahkan baris antarperiode; periode ganda ditolak gerbang integritas
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: alur unggah tidak berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru; koreksi skema tetap zod + rate limit
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — migrasi berhenti dengan pesan bila ada APPEND (fail-closed); kolom baru default null = non-periode
