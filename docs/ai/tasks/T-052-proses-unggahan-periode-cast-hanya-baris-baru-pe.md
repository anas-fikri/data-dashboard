---
id: T-052
title: 'Proses unggahan periode: cast hanya baris baru, pecah per periode, susun rencana, aktifkan dengan aman'
status: done
profile: strict
profile_pinned: true
goal: G-6
tags:
  - ingest
  - data-integrity
  - api
depends_on:
  - T-051
  - T-039
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T13:56:54Z"
closed: "2026-10-20T13:56:54Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f9d43c6a49591b034ffe979cd82b88c2336609f0
paths:
  - .env.example
  - playwright.config.ts
  - prisma/migrations/20261020200000_t052_period_upload/migration.sql
  - prisma/schema.prisma
  - scripts/dev-segments.ts
  - scripts/perf-period-ingest.ts
  - src/app/api/uploads/route.ts
  - src/components/datasets/version-history-actions.tsx
  - src/components/datasets/version-history-row.tsx
  - src/components/datasets/version-history-status.ts
  - src/features/audit/service.ts
  - src/features/ingest/ingest.ts
  - src/features/ingest/mapping-input.ts
  - src/features/ingest/mapping.ts
  - src/features/ingest/period-ingest-repo.ts
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-plan.ts
  - src/features/ingest/period-upload-plan.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/refresh.ts
  - src/features/ingest/repo.ts
  - src/features/uploads/client.ts
  - src/features/uploads/http.ts
  - src/features/uploads/service.ts
  - src/features/versions/actions.ts
  - src/features/versions/gc.ts
  - src/features/versions/integrity.ts
  - src/features/versions/mapping.ts
  - src/features/versions/period-commit.ts
  - src/features/versions/period-upload.ts
  - src/features/versions/service.ts
  - src/features/versions/types.ts
  - src/lib/env.ts
  - src/worker/index.ts
  - tests/e2e/period-upload.spec.ts
  - tests/features/ingest/mapping.test.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/ingest/period-upload-plan.test.ts
  - tests/features/ingest/recast-fakes.ts
  - tests/features/ingest/recast.test.ts
  - tests/features/uploads/init-period.test.ts
  - tests/features/versions/gc.test.ts
  - tests/features/versions/mapping.test.ts
  - tests/features/versions/period-commit.test.ts
  - tests/features/versions/period-upload.test.ts
  - tests/features/versions/service.test.ts
  - tests/lib/env.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T13:52:55Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-20T13:52:56Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 210340
    summary: |-
      …
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792504528272,"service":"data-dashboard","host":"127.0.0.1","port":38811,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792504528347,"service":"data-dashboard","host":"127.0.0.1","port":38899,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792504528466,"service":"data-dashboard","host":"127.0.0.1","port":45905,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792504528594,"service":"data-dashboard","host":"127.0.0.1","port":34419,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792504533925,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792504548505,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792504548528,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792504548532,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792504548545,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  183 passed | 1 skipped (184)
            Tests  2374 passed | 10 skipped (2384)
         Start at  13:53:55
         Duration  149.97s (tests 84%, import 13%, transform 2%)

          Isolate  184 workers spawned · ~175ms startup each (spawn + environment, per file)
                   at least ~10.54s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T13:56:26Z"
    tree: e69985d450112c7d64ed1a1a749b4df2960ac6b3db735941d96d9b43202b5cac
  commits:
    - 08ca5b4
    - 0cb153a
    - "1220871"
    - 14bbbc8
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 337259e
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4eea84c
    - 5101f51
    - 538221d
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 686497c
    - 69b8953
    - 6b3ee3f
    - 70136f5
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8570e80"
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - 9159d7c
    - "9298e14"
    - 930dd6d
    - 94bea50
    - 94d85a4
    - a019f8f
    - a03481c
    - a0e1646
    - a687d4c
    - a8f9162
    - acb27a6
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b30aea5
    - b32d50d
    - b8e59ee
    - b933279
    - ba2efef
    - bafb4ad
    - c15362c
    - c1c8b0a
    - c2fd95c
    - c3626c9
    - c76c343
    - ca5782f
    - ccd0a9a
    - ce26ca5
    - ce5d6a7
    - ce649d0
    - cf28ad3
    - d32a8ea
    - d557c9e
    - da46e35
    - dfc2ebb
    - dff9b8c
    - e24e070
    - e51fcb4
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fc288cb
    - fc87996
  acceptance:
    total: 6
    done: 6
  audit:
    at: "2026-10-20T13:56:27Z"
    passed: true
    tree: e69985d450112c7d64ed1a1a749b4df2960ac6b3db735941d96d9b43202b5cac
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 495 dirs visited, 2846 inodes visited, 1 Extract calls, 232.826581ms elapsed, 232.82687ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-20, Fase 3 (§4.5 langkah 2–5,
§4.6, §5.1). Unggahan ke dataset per periode (mode PERIOD) hanya mem-parse dan meng-cast file baru dengan
skema aktif (tanpa inferensi), memecah file menjadi satu segmen per periode dalam satu pass, menolak lebih
awal bila batas terlewati (label: setelah parse; kolom: setelah hitung per periode), menghitung vonis cast
98% atas baris baru saja, lalu menyusun rencana `computePeriodPlan` yang SELALU dihitung ulang di bawah lock
Dataset: aktif otomatis hanya bila murni menambah, dalam batas, mode kolom, tanpa peringatan, dan versi
dasar init = versi aktif; selain itu AWAITING_CONFIRM ("Terapkan" membandingkan sidik rencana yang dilihat
pemilik → PLAN_STALE; "Batalkan unggahan"; dibuang otomatis setelah PERIOD_CONFIRM_TTL_HOURS). Aktivasi
meneruskan sheetMap dan melewati verifyVersionIntegrity. Init membawa mode/label/baseVersionId; resume
hanya untuk mode + label yang sama dan InitOk menggemakan mode efektif. Cek ulang kontrak T-016 (otorisasi:
semua jalur baru pemilik saja, NOT_FOUND) dan T-017 (ekspor tidak berubah: membaca manifest versi aktif).

## Acceptance criteria
- [x] Given dataset periode bulanan berisi Jan–Mar dan file April (mode kolom), when ingest selesai, then hanya file baru yang di-parse dan di-cast (durasi ≤ 1,2× unggahan file yang sama ke dataset kosong), rencana berbunyi 'April 2026 ditambahkan (n baris)', versi aktif otomatis, dan tidak ada objek baru untuk Jan–Mar
- [x] Given 500 baris baru dengan 20 tanggal gagal cast di atas basis 100.000 baris valid, then vonis cast dihitung atas 500 baris baru (4% > 2%) sehingga hasilnya AWAITING_MAPPING
- [x] Given file arsip 12 bulan, then file dipecah menjadi satu segmen per periode dalam satu pass, dan periode dengan baris < 10% periode terbesar di file ditandai 'kemungkinan nyasar' sehingga rencana masuk AWAITING_CONFIRM
- [x] Given mode label, then penolakan karena batas terjadi setelah parse (sebelum typing); given mode kolom, then penolakan terjadi setelah query hitung per periode (sebelum writeTyped penuh)
- [x] Given versi aktif atau schemaRevision berubah antara rencana dan konfirmasi, then PLAN_STALE, rencana dihitung ulang, dan konfirmasi diminta ulang bila ada yang merusak; aktivasi meneruskan sheetMap dan melewati verifyVersionIntegrity
- [x] Given file yang sama dipilih ulang dengan mode/label berbeda, then resume tidak melanjutkan versi lama, dan InitOk menggemakan mode efektif

## Risk
- Impact: jalur ingest baru untuk versi mode PERIOD (`period-ingest.ts`, dipilih worker dari
  DatasetVersion.mode; versi REPLACE tetap `runIngest` apa adanya), commit periode bersama worker/app
  (`versions/period-commit.ts`), init unggah menerima mode/label/baseVersionId (tanpa mode = REPLACE, klien
  lama tetap jalan), Server Action tinjau/"Terapkan" (UI T-054), tombol "Batalkan unggahan" di riwayat,
  job pemeliharaan `expire-period-confirm`, GC menahan file typed segmen versi belum terminal, recast
  memakai jenis file per segmen, pemetaan versi periode ditolak (T-057). Migrasi aditif
  `20261020200000_t052_period_upload` (DatasetVersion.baseVersionId, periodLabel). Periode lama tidak
  pernah ditulis ulang: manifest baru merujuk file typed yang sama.
- Security (STRIDE): Spoofing/Elevation — route unggah tetap Origin + requireUser + scope pemilik; Server
  Action tinjau/Terapkan lewat asOwner (requireUser) + filter ownerId (bukan pemilik → NOT_FOUND).
  Tampering — mode/label/baseVersionId divalidasi (enum, tanggal ISO = awal periode, id cuid), include =
  kunci periode ber-regex, sidik sha256 heksa, ack zod strict; SQL periode hanya dari posisi kolom skema +
  DATE literal tervalidasi; rencana tidak pernah dipercaya dari klien atau dari rencana beku (dihitung ulang
  di bawah lock). Repudiation — AuditLog dataset.period.confirm (pelaku, ip, ringkasan, include, baris
  dibuang). Information disclosure — tinjauan hanya metadata (jumlah baris/periode), pemilik saja. DoS —
  satu versi belum terminal per dataset (DATASET_BUSY), versi menunggu konfirmasi dibuang otomatis
  (PERIOD_CONFIRM_TTL_HOURS, bawaan 168), penolakan batas sebelum typing, rate limit query/versionChange.
- Rollback: aplikasi — revert commit (versi PERIOD yang sudah READY tetap bisa dipakai/rollback karena
  manifestnya data biasa); data — aktifkan versi sebelumnya dari Riwayat versi. Skema —
  `ALTER TABLE "DatasetVersion" DROP COLUMN "baseVersionId", DROP COLUMN "periodLabel";` setelah tidak ada
  versi PERIOD yang belum terminal.
- Validation: unit period-ingest (DuckDB sungguhan) 15, period-upload-plan 11, period-commit 9,
  period-upload (app) 8, init-period 9, gc +1, recast +1 (regresi jenis file), mapping +2, service +3, env +1;
  e2e `period-upload` 4/4 (worker sungguhan) + regresi terarah; perf `scripts/perf-period-ingest.ts`
  (docs/ai/perf/T-052.md); `aitk check`.

## Notes

- Dari review T-049 (L2): canDiscard hanya AWAITING_MAPPING dan AWAITING_CONFIRM tanpa kedaluwarsa otomatis — T-052 harus rilis bersama layar tinjauan/buang (T-053/T-054) atau memperluas canDiscard + auto-buang 7 hari.
- Ditangani di T-052 (bukan menunggu T-053/T-054): `canDiscard` riwayat kini juga AWAITING_CONFIRM (tombol
  "Batalkan unggahan" di baris riwayat, `discardVersion` yang sama), dan job pemeliharaan
  `expire-period-confirm` (tiap jam) membuang versi AWAITING_CONFIRM yang lebih tua dari
  `PERIOD_CONFIRM_TTL_HOURS` (env baru, bawaan 168 = 7 hari) di bawah lock Dataset — dataset tidak pernah
  tertahan selamanya. Layar tinjauan (tabel Periode | Sekarang | Setelah, "Masukkan" periode nyasar, centang
  menyusut) = T-054; backend-nya sudah ada: `reviewPeriodUploadAction` (rencana dihitung ulang + sidik) dan
  `confirmPeriodUploadAction` (PLAN_STALE bila sidik berbeda).
- Keputusan standar (asumsi aman, bisa diubah pemilik):
  - Rencana TIDAK PERNAH dipercaya dari rencana beku: worker dan "Terapkan" sama-sama menghitung ulang
    `computePeriodPlan` dari manifest aktif + pengaturan dataset + batas env di bawah lock Dataset
    (`decidePeriodCommit`). "Terapkan" membandingkan sidik rencana hitung ulang dengan sidik yang dilihat
    pemilik; beda apa pun (bukan hanya yang "merusak") → PLAN_STALE + rencana baru dibekukan, pemilik
    meninjau ulang. Lebih ketat dari rencana (§4.5 "bila ada yang merusak") — aman, satu klik tambahan.
  - Aktif otomatis juga mensyaratkan versi dasar saat init (`baseVersionId`) = versi aktif saat diproses;
    beda → menunggu konfirmasi (pemilik melihat rencana terhadap data terbaru). Init mode PERIOD menolak
    `STALE` (409) bila versi aktif sudah berganti sejak halaman dibuka.
  - Acuan cast basi (koreksi skema/versi aktif berganti setelah file diproses): worker → ingest diulang
    (seperti REPLACE); "Terapkan" → versi kembali UPLOADED dan diproses ulang dengan skema terbaru
    (PLAN_STALE "file diproses ulang"); file asli sudah dihapus retensi → minta batalkan + unggah ulang.
  - Baris tanpa tanggal valid (≤ 2% sehingga lolos vonis) tidak pernah dibuang diam-diam: rencana
    `droppedRows` + alasan DROPPED_ROWS → AWAITING_CONFIRM; "Terapkan" wajib `ack.droppedRows` = jumlahnya.
  - Vonis cast 98% dihitung atas semua baris file baru (termasuk baris tanpa tanggal valid), tidak atas
    gabungan periode lama. Gagal → AWAITING_MAPPING dengan sheet raw saja (tanpa typed); pemetaan versi
    periode ditolak dengan pesan (app + worker) sampai T-057 — versi itu hanya bisa dibuang.
  - Kolom terlihat yang hilang / kolom periode yang hilang / kolom kosong (absent) yang kembali ada →
    AWAITING_MAPPING (T-057). Kolom tambahan yang tidak cocok: tetap di raw.parquet segmen, tidak masuk
    typed (T-057 menjadikannya kolom tersembunyi kanonik) — tidak ada data yang hilang dari raw.
  - Sheet file yang tidak berpasangan dengan sheet data periode aktif tidak disimpan; rencana mencatat
    `ignoredSheets` + alasan IGNORED_SHEETS → wajib dikonfirmasi (field rencana baru, default [] untuk rencana
    lama). Rencana juga mencatat `fileSheets` (sheet logis di file) untuk hitung ulang saat "Terapkan".
  - Satu periode, tanpa baris tanpa tanggal: raw segmen = raw file utuh (tanpa salinan), profil dipakai
    sekali (vonis + profil tersimpan) — biaya tambahan hanya query penetapan periode + cek tanggal ∈
    periode. Banyak periode: raw per periode disalin (satu pass parse, salinan per periode dari raw lokal).
  - Peta kolom (T-gcn8) divalidasi sebelum dipakai (`validateColMap`: panjang = kolom kanonik, nilai 0..kolom
    raw, tanpa ganda, identitas hanya bila jumlah kolom sama); `canonicalProfile` tidak bisa lagi membuang
    posisi diam-diam karena kolom di luar jumlah kanonik ditolak lebih dulu (perlu pemetaan).
  - GC: file typed segmen yang ditulis versi belum terminal tetap dirujuk walau tidak di manifest (periode
    nyasar yang dikecualikan bawaan masih bisa "Masukkan" saat Terapkan); setelah READY/FAILED/dibuang
    aturan lama berlaku.
  - Recast per segmen kini memakai `Segment.sourceKind` (xlsx/CSV bergantian antarbulan) — sebelumnya jenis
    file versi untuk semua segmen (regresi: tanggal seri Excel bergeser sehari). Uji: recast.test "T-052".
- Untuk task lanjutan:
  - T-053: panel unggah mengirim `period: { baseVersionId, label }` ke `uploadFile` (client.ts); InitOk
    menggemakan `mode`/`label`. Tanpa itu panel tetap "ganti semua data" (REPLACE) seperti sekarang.
  - T-054: pakai `reviewPeriodUploadAction(datasetId, versionId, { include })` → `{ plan, digest, summary }`
    dan `confirmPeriodUploadAction(…, { include, digest, ack: { shrink, droppedRows } })`; PLAN_STALE →
    muat ulang tinjauan. Pesan riwayat: `periodPlanSummary`.
  - T-057: AWAITING_MAPPING versi PERIOD menyimpan sheet raw saja (Segment periodKey null, tanpa
    SegmentTyped); pemetaan harus memecah per periode lewat jalur yang sama (`decidePeriodCommit`).
  - T-058: proyeksi skema campuran `withSegments` belum membawa `_period`; segmen unggahan periode ditulis
    dengan set kolom = semua posisi skema aktif (sama dengan segmen Atur periode), jadi daftar tetap polos.
- Bukti AC (2026-10-20):
  - AC1: unit `period-ingest.test.ts` "AC1" (satu segmen baru April, objek baru hanya raw+typed April,
    manifest Jan–Mar = file typed aktif yang sama, rencana "April 2026 ditambahkan (30 baris)", aktif
    otomatis; urutan kolom berbeda → peta kolom); e2e `period-upload` AC1 (worker sungguhan: typedId Jan–Mar
    sama, jumlah objek prefix segmen Jan–Mar tidak berubah, KPI 280/7, catatan riwayat); durasi
    docs/ai/perf/T-052.md: rasio 1,02 (300 rb baris) dan 1,03 (1 jt baris) ≤ 1,2.
  - AC2: unit "500 baris baru, 20 tanggal gagal cast … basis 100.000" → AWAITING_MAPPING ("hanya 96%"),
    tanpa typed; 5 dari 500 → lolos + DROPPED_ROWS (tidak dibuang diam-diam).
  - AC3: unit "12 bulan + 3 baris nyasar" → 13 segmen dalam satu pass, Desember 2025 EXCLUDED/stray,
    AWAITING_CONFIRM; `period-upload-plan.test.ts` "Masukkan" periode nyasar saat Terapkan.
  - AC4: unit "AC4" mode kolom (REJECT, tanpa segmen/objek, commit tidak dipanggil) dan mode label (di luar
    jendela, tanpa segmen).
  - AC5: `period-commit.test.ts` (acuan basi → stale; sidik berbeda → plan_stale + rencana baru dibekukan;
    aktif dengan sheetMap setelah verifyVersionIntegrity atas manifest yang dibaca ulang di transaksi; kunci
    hilang → IntegrityError); `period-upload.test.ts` (PLAN_STALE, proses ulang); e2e AC5 (sidik basi →
    PLAN_STALE, "Buang N baris" salah → INVALID, sidik tinjauan → aktif + AuditLog dataset.period.confirm).
  - AC6: `init-period.test.ts` (resume hanya mode+label sama; pilihan lain → versi lama dibuang, multipart
    di-abort; InitOk gema mode/label) + e2e AC6.
  - Regresi e2e terarah: period-upload 4/4, period-setup 3/3, versions 7/7, mapping 4/4, ingest 4/4, schema
    7/7, recast-segments 1/1, uploads 9/9; `aitk check` lulus (unit 2369).
- Review putaran 1 (koordinator, 0 blokir), diperbaiki:
  - M1: "Terapkan" saat manifest aktif berubah setelah HEAD kunci (mis. recast sheet lain yang tidak ada di
    file menukar file typed) kini `retry` tanpa tulisan → DATASET_BUSY "coba terapkan lagi"; tidak pernah
    menandai versi FAILED. Hanya file baru versi ini yang hilang yang tetap gagal integritas. Uji:
    period-commit "review M1", period-upload "review M1".
  - L1: status versi dibaca ulang setelah lock FOR UPDATE (buang/kedaluwarsa sebelum lock → gone/NOT_PENDING).
  - L2: setelah FAILED tercatat dari INGESTING (commit pasti tidak masuk) objek seg/ percobaan itu dihapus
    walau commit sempat dipanggil. Uji period-ingest "review L2".
  - L3: unggahan lama (mode/label lain) hanya dibuang bila unggahan baru dibuat; penolakan sesudahnya
    membatalkan transaksi (multipart lama tidak di-abort). Uji init-period "review L3".
  - Setelah perbaikan: unit terarah 72/72, e2e period-upload 4/4, versions 7/7.
- `aitk impact`/cakupan: `period-ingest-repo.ts` dan `versions/period-commit.ts` jalur Prisma dicakup e2e
  `period-upload` (worker sungguhan) + unit commit dengan transaksi tiruan.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas kepercayaan = route unggah (Origin + sesi) / Server Action (isian klien) → service app (zod + cek pemilik + hitung ulang rencana di bawah lock) → data job (versionId saja) → worker (memuat semuanya dari DB, rencana dihitung ulang saat commit); tidak ada data rahasia
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak ada kredensial/endpoint auth baru; sesi via requireUser yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: init PERIOD tetap scope pemilik dataset; reviewPeriodUpload/confirmPeriodUpload lewat asOwner + versi di-filter dataset.ownerId (bukan pemilik → NOT_FOUND, unit period-upload); buang lewat discardVersion yang sama (lock Dataset milik user)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: mode enum, label tanggal ISO + awal periode, baseVersionId cuid; include regex kunci periode, digest sha256 heksa, ack zod strict; SQL periode hanya posisi kolom skema (bilangan bulat) + DATE literal setelah isIsoDate; peta kolom divalidasi (validateColMap); tanpa SQL dari klien
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — sha256 hanya sidik rencana/file (bukan rahasia)
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: pesan Bahasa Indonesia yang bisa ditindak (batas, PLAN_STALE, pemetaan belum tersedia); galat tak terduga → pesan umum, detail di log; AuditLog dataset.period.confirm tanpa isi data
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: rencana/riwayat hanya label periode + jumlah baris + nama sheet; versi tertunda dibuang otomatis (TTL) dan segmennya disapu GC
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru; job pemeliharaan baru hanya membuang versi AWAITING_CONFIRM kedaluwarsa (terjadwal, tercatat di log)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: rencana selalu dihitung ulang di bawah lock (tidak memercayai autoActivate beku); sidik rencana basi → PLAN_STALE; acuan cast basi → proses ulang; batas per periode utuh ditegakkan sebelum typing dan saat commit; satu versi belum terminal per dataset; resume hanya mode+label sama; commit tak pasti tidak menghapus objek
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — verified: validasi unggah (ekstensi, ukuran, signature) tidak berubah; kunci objek segmen dibuat server (seg/<cuid>/)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: route init membaca field baru eksplisit (bukan spread body), kode STALE → 409; Server Action berskema zod + rate limit (query untuk tinjau, versionChange untuk Terapkan)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: tanpa mode = REPLACE (perilaku lama); PERIOD_CONFIRM_TTL_HOURS default 168 dengan rentang zod (uji env); migrasi aditif

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T13:56:26Z (210340 ms)
- Acceptance criteria: 6/6 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 337259e, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, b933279, ba2efef, bafb4ad, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, dfc2ebb, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
