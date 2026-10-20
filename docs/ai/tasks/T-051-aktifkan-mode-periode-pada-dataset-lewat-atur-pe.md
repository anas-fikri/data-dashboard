---
id: T-051
title: Aktifkan mode periode pada dataset lewat 'Atur periode'
status: done
profile: strict
goal: G-6
tags:
  - ui
  - data-integrity
  - security
depends_on:
  - T-049
  - T-050
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T12:35:55Z"
closed: "2026-10-20T12:35:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c3626c94268728388b13d74f0249c1045b702980
paths:
  - playwright.config.ts
  - prisma/migrations/20261020190000_t051_period_settings/migration.sql
  - prisma/schema.prisma
  - scripts/dev-segments.ts
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/periode/page.tsx
  - src/components/datasets/period-setup-form.tsx
  - src/components/datasets/version-history-row.tsx
  - src/features/audit/service.ts
  - src/features/datasets/service.ts
  - src/features/ingest/period-setup-plan.ts
  - src/features/ingest/period-setup-repo.ts
  - src/features/ingest/period-setup.ts
  - src/features/versions/actions.ts
  - src/features/versions/period-setup.ts
  - src/features/versions/service.ts
  - src/features/versions/types.ts
  - src/lib/queue/versions.ts
  - src/worker/index.ts
  - tests/components/version-history-busy.test.ts
  - tests/components/version-history-r2.test.ts
  - tests/components/version-history-status.test.ts
  - tests/e2e/period-setup.spec.ts
  - tests/features/ingest/period-setup-plan.test.ts
  - tests/features/ingest/period-setup.test.ts
  - tests/features/versions/period-setup.test.ts
  - tests/features/versions/service.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T12:32:20Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-20T12:32:20Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 188759
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792499673060,"service":"data-dashboard","host":"127.0.0.1","port":46491,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792499673115,"service":"data-dashboard","host":"127.0.0.1","port":45003,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792499673210,"service":"data-dashboard","host":"127.0.0.1","port":37929,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792499673317,"service":"data-dashboard","host":"127.0.0.1","port":39381,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792499684698,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792499695590,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792499695611,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792499695614,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792499695625,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  178 passed | 1 skipped (179)
            Tests  2309 passed | 10 skipped (2319)
         Start at  12:33:14
         Duration  133.65s (tests 84%, import 13%, transform 3%)

          Isolate  179 workers spawned · ~152ms startup each (spawn + environment, per file)
                   at least ~8.92s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T12:35:29Z"
    tree: 8c8f5e7b26f826c63e31bfb7a98c0ce80bc4cf55683b1a110d1f8cf010f80355
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
    - dff9b8c
    - e24e070
    - e51fcb4
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - fc288cb
    - fc87996
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-20T12:35:30Z"
    passed: true
    tree: 8c8f5e7b26f826c63e31bfb7a98c0ce80bc4cf55683b1a110d1f8cf010f80355
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 489 dirs visited, 2705 inodes visited, 1 Extract calls, 216.429418ms elapsed, 216.429611ms wall time
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
Rencana G-6 (docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md) P-19, Fase 3, §4.4 "Mengaktifkan
periode pada data yang sudah ada" + §5.2/§5.3 pengaturan dataset. Pemilik membuka "Atur periode" di dataset
dengan versi aktif READY, memilih satuan (bulan/kuartal/tahun) dan sumber periode per sheet (kolom tanggal
bertipe, atau "Saya pilih saat upload" + periode data sekarang), serta "Simpan N periode" (≤ PERIOD_KEEP_MAX)
dan "Saat batas tercapai" (REJECT/EVICT_OLDEST, disimpan di Dataset lewat migrasi aditif). "Tinjau" menampilkan
sebaran baris per periode, baris tanpa tanggal valid (+ ≤ 20 contoh nomor baris), meter batas, dan proyeksi
kapasitas tanpa mengubah data. "Terapkan" (nonaktif sampai "Buang N baris" dicentang bila ada baris tanpa
tanggal) membuat versi PERIOD_SETUP yang dipecah worker menjadi satu segmen per periode lalu diaktifkan
(gerbang integritas + AuditLog); rollback ke versi sebelumnya mengembalikan mode biasa. Kontrak T-016
(otorisasi: pemilik saja, NOT_FOUND) dan T-017 (ekspor tidak tersentuh; sumber query = manifest segmen) dicek
ulang sesuai R21.

## Acceptance criteria
- [x] Given versi aktif READY, when pemilik memilih 'Dari kolom tanggal: Tanggal Kirim · per bulan' atau 'Saya pilih saat upload' lalu 'Tinjau', then tampil sebaran baris per periode, jumlah baris tanpa tanggal valid (dengan ≤ 20 contoh nomor baris), dan proyeksi kapasitas, tanpa ada data yang berubah
- [x] Given ada baris tanpa tanggal valid, then 'Terapkan' nonaktif sampai pemilik memilih eksplisit 'Buang N baris', dan pilihan itu tercatat di riwayat
- [x] Given 'Terapkan', when job selesai, then versi PERIOD_SETUP aktif dengan satu segmen per periode, total dan angka dashboard sama (dikurangi baris yang dibuang eksplisit), dan rollback mengembalikan dataset ke mode biasa
- [x] Given 'Simpan N periode' > PERIOD_KEEP_MAX atau pengguna bukan pemilik, then ditolak; AuditLog mencatat aktivasi, dan pilihan 'Saat batas tercapai: Tolak unggahan (default) / Lepas periode terlama otomatis' dijelaskan di layar

## Risk
- Impact: data aktif dataset dipecah ulang menjadi segmen per periode (versi baru, O(total) sekali). Yang
  berubah: kolom Dataset.keepPeriods/onLimit (migrasi aditif `20261020190000_t051_period_settings`), job
  "period-setup" di antrean ingest, halaman `/datasets/[id]/periode`, kartu "Data per periode" + catatan
  riwayat versi. Versi lama tidak disentuh.
- Security (STRIDE): Spoofing/Elevation — semua Server Action lewat requireUser + filter ownerId (bukan
  pemilik → NOT_FOUND, halaman 404). Tampering — isian zod strict; kolom periode harus kolom date/timestamp
  dari skema (posisi bulat), satuan dari enum, label ISO divalidasi; SQL hanya dari nilai tervalidasi, tanpa
  SQL dari klien; sebaran yang ditinjau dihitung ulang di server dan dicocokkan lagi oleh job. Repudiation —
  AuditLog dataset.period.activate (pelaku, ip, satuan, periode, baris dibuang) dan dataset.period.settings.
  Information disclosure — Tinjau hanya untuk pemilik dataset, hanya nomor baris (bukan isi). DoS — Tinjau
  lewat mesin query (jatah per user, slot global, batas waktu, rate limit query); Terapkan rate limit
  versionChange + satu versi belum terminal per dataset (DATASET_BUSY).
- Rollback: aplikasi — revert commit; data — aktifkan versi sebelum PERIOD_SETUP dari Riwayat versi (manifest
  lama utuh). Skema — `ALTER TABLE "Dataset" DROP COLUMN "keepPeriods", DROP COLUMN "onLimit"; DROP TYPE
  "PeriodOnLimit";` (kolom belum dibaca kode lain).
- Validation: unit (period-setup-plan 11, job DuckDB 9, service app 10, riwayat 1) + e2e `period-setup` 3/3
  (worker sungguhan) + e2e `versions` 7/7, `datasets`+`uploads` 16/16; `aitk check` lulus.

## Notes
- Bukti AC:
  - AC1: e2e `period-setup` "AC1+AC2+AC4" (sebaran 3 periode, "2 baris tanpa tanggal valid", contoh "6, 9",
    meter "3 dari 24 periode", proyeksi; versi tetap satu = tidak ada yang berubah); unit
    `tests/features/versions/period-setup.test.ts` (Tinjau tanpa transaksi), `period-setup-plan.test.ts`.
  - AC2: e2e (Terapkan nonaktif + alasan sampai "Buang 2 baris" dicentang; catatan riwayat "… 2 baris tanpa
    tanggal valid dibuang atas pilihan pemilik"); unit service (tanpa centang → INVALID, tanpa versi), job
    (dropMissing tidak cocok → FAILED), `service.test.ts` (catatan riwayat dari rencana beku).
  - AC3: e2e "AC3" (versi PERIOD_SETUP aktif, segmen 2026-01/02/03 = 3/2/1 baris, KPI sum/count 285/8 →
    185/6 = minus 40+60 yang dibuang, rollback → mode biasa + 285/8); unit job DuckDB (`_period`, `_row` unik,
    nilai per periode, raw membawa baris judul, acuan basi → FAILED tanpa sisa objek).
  - AC4: e2e (Simpan 61 → "Simpan paling banyak 60 periode."; penjelasan dua pilihan "Saat batas tercapai" di
    layar; non-pemilik 404; AuditLog dataset.period.activate + dataset.period.settings); unit service
    (NOT_FOUND non-pemilik, keep > max INVALID, audit hanya bila berubah).
- Keputusan standar (asumsi, bisa diubah pemilik):
  - Atur ulang periode untuk dataset yang SUDAH per periode (versi aktif periodGrain ≠ null atau sheet
    beberapa segmen) belum didukung: ditolak dengan arahan "ganti semua data". Halaman menampilkan pengaturan
    saja. Butuh penggabungan raw lintas segmen — task lanjutan.
  - "Saya pilih saat upload" pada data yang sudah ada: semua baris sheet itu masuk satu periode pilihan pemilik
    (satu label untuk semua sheet berlabel).
  - Tanggal valid = tidak NULL dan tahun 1000–9999 (di luar itu dihitung "tanpa tanggal valid"). Periode kecil
    tidak dikecualikan saat aktivasi (semua baris ikut; "nyasar" hanya relevan untuk unggahan, T-052).
  - Batas lebih dari "Simpan N periode" saat aktivasi → Terapkan nonaktif (tidak ada pelepasan saat aktivasi).
  - Pengaturan disimpan saat Terapkan (dan lewat "Simpan pengaturan" setelah mode periode aktif).
- Plugin frontend-expert tidak tersedia di sesi cloud ini; UI mengikuti token (tanpa hex), Tabler
  `size=20 stroke=1.5`, CTA penuh di < 768, label/fieldset/aria-describedby, aria-live untuk hasil tinjauan.
  Audit `/frontend-expert:audit` belum dijalankan → dicatat untuk reviewer.
- Review putaran 1 (koordinator), diperbaiki:
  1. Sheet hanya-judul (typed, 0 baris data) tidak lagi lolos menjadi sheet tanpa typed/manifest: Tinjau
     menonaktifkan Terapkan dengan pesan, job menolak sheet tanpa periode (uji plan + job header-only).
  2. Terapkan membawa tinjauan yang dilihat pemilik (`reviewed`: baseVersionId + sha256 sebaran/baris tanpa
     tanggal per sheet); hitungan ulang server berbeda → STALE "Data berubah sejak ditinjau…" (uji service).
  3. Job memverifikasi setiap file typed baru: semua baris bertanggal valid dan date_trunc = `_period`
     segmennya (periode diambil dari typed lama, nilai dicast ulang dari raw); meleset → FAILED, segmen
     dihapus (uji job dengan typed dasar bergeser satu bulan).
  4. Sheet tanpa data typed membawa rawKey dasar (bukan "").
  5. Job basi yang diambil ulang (stalled) saat worker pertama masih hidup bisa berjalan dua kali — risiko
     yang sama dengan ingest (lock BullMQ diperpanjang otomatis, maxStalledCount 2). Hanya satu yang bisa
     commit (status INGESTING dijaga di finish); deleteAttempt percobaan kedua bisa menghapus baris/segmen
     percobaan pertama di tengah jalan sehingga salah satunya gagal (FK/gerbang integritas) → versi FAILED dan
     pemilik menerapkan ulang. Tidak ada data
     aktif yang berubah. Belum ditangani khusus (sama dengan ingest).
- `aitk impact`: period-setup-form.tsx dan period-setup-repo.ts tanpa unit test; keduanya dicakup e2e
  `period-setup` (UI + Prisma repo lewat worker sungguhan).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas kepercayaan = Server Action (isian klien) → service app (zod + cek pemilik + hitung ulang Tinjau) → data job antrean (dibuat server) → worker (cek ulang acuan + sebaran); tidak ada data rahasia
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak ada kredensial/endpoint auth baru; sesi via requireUser yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: preview/apply/settings lewat asOwner (requireUser) + query `ownerId` (lock FOR UPDATE untuk tulis); bukan pemilik → NOT_FOUND, halaman /periode 404 (e2e AC4, unit service)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: zod strict (satuan enum, sheet id cuid unik, kolom int, label ISO = awal periode, keep 1..PERIOD_KEEP_MAX, dropMissing int); kolom periode harus date/timestamp dari skema; SQL hanya dari posisi/enum/tanggal tervalidasi, tanpa SQL dari klien
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia tersimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: galat → pesan Indonesia yang bisa ditindak, galat tak terduga → pesan umum (detail di log); AuditLog dataset.period.activate/settings tanpa isi data
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: Tinjau hanya mengirim jumlah baris dan ≤ 20 nomor baris (bukan isi sel) ke pemilik; rencana beku tanpa isi data
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tanpa jaringan eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru, tanpa panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: satu versi belum terminal per dataset (DATASET_BUSY); acuan (versi aktif + revisi skema) dipin dan dicek di app + saat aktivasi di bawah lock; sebaran job harus sama persis dengan yang ditinjau; buang baris hanya bila jumlah = pilihan eksplisit; commit tak pasti tidak menghapus objek
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada unggahan baru; kunci objek segmen dibuat server (seg/<id>/)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: Server Action berskema zod, rate limit (query untuk Tinjau, versionChange untuk Terapkan/pengaturan)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: default aman (onLimit REJECT, keepPeriods null = bawaan admin, CHECK ≥ 1); tanpa debug/konfigurasi baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T12:35:29Z (188759 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, b933279, ba2efef, bafb4ad, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
