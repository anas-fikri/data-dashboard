---
id: T-qqyx
title: Atur ulang periode pada dataset yang sudah per periode (ganti grain/kolom)
status: in_progress
profile: standard
created: "2026-10-20T12:32:19Z"
updated: "2026-10-20T21:37:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 0e22c88b591ab0965cdcc2eb6e1fb700d8c441a4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 191400
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792532179996,"service":"data-dashboard","host":"127.0.0.1","port":45113,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792532180051,"service":"data-dashboard","host":"127.0.0.1","port":38303,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792532180158,"service":"data-dashboard","host":"127.0.0.1","port":43289,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792532180276,"service":"data-dashboard","host":"127.0.0.1","port":37971,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792532190341,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792532196301,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792532196324,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792532196326,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792532196335,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  199 passed | 1 skipped (200)
            Tests  2647 passed | 10 skipped (2657)
         Start at  21:34:56
         Duration  129.62s (tests 84%, import 13%, transform 3%)

          Isolate  200 workers spawned · ~146ms startup each (spawn + environment, per file)
                   at least ~9.62s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T21:37:07Z"
    tree: 0fd31712daead7623b88eb19746ab64a5b9a3af884be54c5ce83968a4007fb39
  audit:
    at: "2026-10-20T21:19:37Z"
    passed: true
    tree: 5895c83baaa2fce8f48ece9fe816dbd10378443bc84a171f27e77ac5298e1239
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 514 dirs visited, 3713 inodes visited, 1 Extract calls, 213.303528ms elapsed, 213.303806ms wall time
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
Lanjutan T-051 (rencana G-6 docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md §4.4 "Aturan beku":
mengganti sumber atau satuan periode harus lewat "Atur periode" ulang — versi `PERIOD_SETUP` baru — atau
"Ganti semua data"). Pemilik dataset yang SUDAH per periode membuka "Atur periode" dan, selain kartu
pengaturan, mendapat kartu "Atur ulang periode": memilih satuan baru (bulan/kuartal/tahun) dan per sheet
kolom tanggal lain atau "Ikuti periode sekarang" (periode segmen dibawa ke satuan sama/lebih besar; sheet
menjadi bersumber label), lalu "Tinjau" (sebaran atas seluruh manifest aktif — banyak segmen, kelompok file,
sheet berlabel — tanpa mengubah data) dan "Terapkan" (digest tinjauan yang sama dengan T-051). Worker
memecah setiap segmen sumber per periode baru menjadi segmen baru (raw/typed baru, verifikasi `_period` per
segmen, gerbang integritas) dan periode yang terisi dari beberapa segmen sumber menjadi satu kelompok segmen
lengkap (T-060). Segmen aktif tidak pernah diubah di tempat; versi sebelumnya (periode lama) tetap bisa
diaktifkan lagi. Jalur "Ganti semua data…" tetap terlihat jelas di kartu yang sama.

## Acceptance criteria
- [x] Given dataset sudah per periode, when pemilik membuka Atur periode, then ia bisa meninjau dan menerapkan grain/kolom periode baru lewat versi baru yang bisa di-rollback, atau mendapat jalur 'ganti semua data' yang jelas

## Risk
- Impact: job "period-setup" kini menerima sheet beberapa segmen (dua tahap: tabel `assign` dari typed
  setiap segmen, lalu raw setiap segmen dipecah per periode); Tinjau memetakan baris ke segmen lewat
  rentang `_row`; halaman `/datasets/[id]/periode` menampilkan kartu "Atur ulang periode" untuk dataset
  periode. Aktivasi pertama (T-051) tetap jalur yang sama (satu segmen = kasus khusus). Tanpa migrasi
  (kolom Segment.groupId/groupPart/groupSize sudah ada dari T-060; `plan.resetFrom` opsional di JSON).
- Security (STRIDE): Spoofing/Elevation — tetap requireUser + filter ownerId (NOT_FOUND); Tampering — zod
  strict (sumber enum COLUMN/LABEL/KEEP; KEEP hanya untuk dataset periode, LABEL hanya untuk data biasa),
  rentang `_row` di SQL hanya bilangan dari DB, label ISO tervalidasi, kolom dari skema; digest tinjauan
  memuat jumlah bagian per periode; job mencocokkan ulang baris + bagian per periode; Repudiation — AuditLog
  dataset.period.activate membawa fromGrain; DoS — sama dengan T-051 (mesin query berjatah, satu versi
  belum terminal, rate limit versionChange).
- Rollback: aplikasi — revert commit; data — aktifkan versi periode sebelumnya dari Riwayat versi (manifest
  lama utuh; segmen lama tidak disentuh). Tanpa migrasi skema.
- Validation: unit plan 15, job DuckDB 13 (4 baru: kuartal dari 3 segmen = kelompok lengkap, KEEP ke tahun,
  KEEP ke satuan lebih kecil ditolak, bagian berbeda ditolak), service 14 (5 baru); e2e `period-setup` 4/4
  (baru: atur ulang ke kuartal + rollback), `period-upload-panel` 2/2; `aitk check` lulus.

## Notes
- Bukti AC1:
  - e2e `period-setup` "T-qqyx: dataset per periode → atur ulang ke per kuartal…": pengaturan sama →
    Terapkan nonaktif "sama dengan yang sekarang"; Kuartal → sebaran "Kuartal 1 2026 · dari 3 bagian";
    Terapkan → versi PERIOD_SETUP per kuartal aktif, 3 segmen 2026-Q1 groupSize 3 (3/2/1 baris), id segmen
    berbeda dari versi per bulan (tidak diubah di tempat), KPI 185/6 sama, AuditLog fromGrain MONTH, catatan
    riwayat "Periode diatur ulang (per bulan → per kuartal) · 1 periode"; rollback ke versi per bulan → kartu
    "Data disimpan per bulan", KPI sama. Tautan "Ganti semua data…" ke halaman dataset.
  - unit `tests/features/ingest/period-setup.test.ts` (atur ulang dari hasil atur periode 3 segmen),
    `tests/features/versions/period-setup.test.ts` (SQL rentang `_row`, nama file contoh baris, KEEP/LABEL
    ditolak di mode yang salah, segmen tanpa rentang → arahan ganti semua data),
    `tests/features/ingest/period-setup-plan.test.ts` (resetBlockers, batas segmen per sheet menghitung
    bagian kelompok, catatan riwayat).
- Keputusan standar (asumsi, bisa diubah pemilik):
  - "Ikuti periode sekarang" hanya ke satuan sama/lebih besar (bulan → kuartal/tahun); ke satuan lebih
    kecil wajib kolom tanggal. Di dataset periode, "satu label untuk semua baris" tidak ditawarkan
    (akan meleburkan semua periode); di data biasa tetap seperti T-051.
  - Pengaturan yang sama persis dengan sekarang (satuan + sumber/kolom setiap sheet) → Terapkan nonaktif
    (job O(total) tanpa hasil).
  - Periode baru dari beberapa segmen sumber disimpan sebagai kelompok segmen (groupId = id versi atur
    ulang), bukan raw yang digabung: raw tiap segmen punya baris judul/peta kolom/jenis file sendiri.
  - Pengaturan "Simpan N periode"/"Saat batas tercapai" di dataset periode diubah lewat kartu pengaturan;
    atur ulang memakai nilai tersimpan. Atur ulang tidak tersedia selama ada versi belum terminal.
  - Sheet beberapa segmen lama tanpa rentang baris (maxSrcRow null) → ditolak dengan arahan ganti semua data.
  - Segmen berlabel hasil atur ulang tidak membawa min/max kolom acuan (sama dengan T-051).
- Review putaran 1 (koordinator): 0 blokir; diperbaiki — L4 uji job DuckDB baru: segmen sumber csv + xlsx
  dengan baris judul/peta kolom berbeda, sumber yang sudah kelompok T-060 (Februari 2 file → kelompok 4
  bagian), satu segmen sumber tersebar ke beberapa periode baru (setiap periode = kelompok); L1 pesan batas
  "Simpan N periode" di atur ulang menunjuk kartu Pengaturan; L2 batas segmen per sheet disebut "bagian";
  L3 komentar urutan contoh baris (urut file, lalu baris) diperbaiki. Unit job 16, plan 15; e2e
  `period-setup` 4/4; `aitk check` lulus.
- `aitk impact`: period-setup-form.tsx dan period-setup-repo.ts tanpa unit test; keduanya dicakup e2e
  `period-setup` (UI + Prisma repo lewat worker sungguhan, termasuk kolom kelompok segmen).
- Plugin frontend-expert tidak tersedia di sesi cloud ini; UI mengikuti token (tanpa hex), Tabler
  `size=20 stroke=1.5` (IconReplace dari paket yang sama), CTA penuh di < 768, label/aria-describedby,
  aria-live hasil tinjauan (pola T-051). `/frontend-expert:audit` belum dijalankan → untuk reviewer.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas sama dengan T-051 — Server Action → service (zod + cek pemilik + hitung ulang Tinjau atas manifest aktif) → data job (dibuat server) → worker (cek ulang acuan, sebaran + bagian per periode); tanpa data rahasia
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak ada kredensial/endpoint auth baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: Tinjau/Terapkan tetap lewat asOwner + query ownerId (lock FOR UPDATE saat Terapkan); bukan pemilik → NOT_FOUND / halaman 404 (e2e AC4, unit service)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: zod strict (sumber enum COLUMN/LABEL/KEEP, kolom bulat dari skema, label ISO); SQL hanya dari posisi skema, enum satuan, label ISO tervalidasi, dan rowBase/maxSrcRow bilangan dari DB; tanpa SQL dari klien
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia tersimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: pesan Indonesia yang bisa ditindak, galat tak terduga → pesan umum; AuditLog dataset.period.activate (+ fromGrain) tanpa isi data
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: Tinjau hanya mengirim jumlah baris, ≤ 20 nomor baris + nama file asal (milik pemilik sendiri), bukan isi sel
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tanpa jaringan eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: satu versi belum terminal per dataset (DATASET_BUSY); acuan + digest tinjauan (termasuk bagian per periode) dicek app dan job; KEEP ke satuan lebih kecil ditolak di app dan job; batas segmen per sheet menghitung bagian kelompok; segmen lama tidak diubah (rollback utuh)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada unggahan baru; kunci objek segmen dibuat server (seg/<id>/)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: Server Action berskema zod, rate limit sama dengan T-051 (query untuk Tinjau, versionChange untuk Terapkan)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: tanpa konfigurasi/env baru; default aman (Terapkan nonaktif bila pengaturan sama, KEEP hanya ke satuan lebih besar)
