---
id: T-051
title: Aktifkan mode periode pada dataset lewat 'Atur periode'
status: in_progress
profile: standard
goal: G-6
tags:
  - ui
  - data-integrity
  - security
depends_on:
  - T-049
  - T-050
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T12:17:19Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c3626c94268728388b13d74f0249c1045b702980
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 203758
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792498583403,"service":"data-dashboard","host":"127.0.0.1","port":40627,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792498583459,"service":"data-dashboard","host":"127.0.0.1","port":44145,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792498583562,"service":"data-dashboard","host":"127.0.0.1","port":33555,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792498583670,"service":"data-dashboard","host":"127.0.0.1","port":39751,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792498595641,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792498601869,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792498601893,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792498601899,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792498601907,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  178 passed | 1 skipped (179)
            Tests  2305 passed | 10 skipped (2315)
         Start at  12:14:55
         Duration  141.74s (tests 85%, import 12%, transform 3%)

          Isolate  179 workers spawned · ~158ms startup each (spawn + environment, per file)
                   at least ~9.28s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T12:17:19Z"
    tree: 54c910c99371a68dab5c7f7dd940d7fd77b83889e24f5ab669a79b2065f15eda
  audit:
    at: "2026-10-20T12:13:23Z"
    passed: true
    tree: 54c910c99371a68dab5c7f7dd940d7fd77b83889e24f5ab669a79b2065f15eda
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 485 dirs visited, 2616 inodes visited, 1 Extract calls, 225.733404ms elapsed, 225.733692ms wall time
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
- Validation: unit (period-setup-plan 10, job DuckDB 7, service app 9, riwayat 1) + e2e `period-setup` 3/3
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
