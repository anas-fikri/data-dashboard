---
id: T-060
title: (Opsional) Satu periode dari beberapa file sebagai satu kelompok
status: in_progress
profile: standard
goal: G-6
tags:
  - upload
  - ingest
  - optional
depends_on:
  - T-054
  - T-059
created: "2026-10-15T02:30:59Z"
updated: "2026-10-20T20:56:33Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 2ed6480fa08a6e5006a4ece0d926a742c61432eb
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 176535
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792529751288,"service":"data-dashboard","host":"127.0.0.1","port":41455,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792529751343,"service":"data-dashboard","host":"127.0.0.1","port":40401,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792529751446,"service":"data-dashboard","host":"127.0.0.1","port":42963,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792529751556,"service":"data-dashboard","host":"127.0.0.1","port":35353,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792529761564,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792529769203,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792529769225,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792529769227,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792529769235,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  199 passed | 1 skipped (200)
            Tests  2632 passed | 10 skipped (2642)
         Start at  20:54:33
         Duration  119.12s (tests 84%, import 13%, transform 3%)

          Isolate  200 workers spawned · ~139ms startup each (spawn + environment, per file)
                   at least ~9.12s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T20:56:33Z"
    tree: cb6b311750a1b960e2a0662709b75c0c6b7ff4d4d1997b0477318ab7dc5ba0bd
  audit:
    at: "2026-10-20T20:40:54Z"
    passed: true
    tree: 10688a10dc71df034bf1e5c3d7d1d05baf52519704cab8f7993c2843365c1e68
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 514 dirs visited, 3619 inodes visited, 1 Extract calls, 202.284862ms elapsed, 202.285132ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-28, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

Tujuan (§4.6 P-28): satu periode yang dipecah ke beberapa file (mis. bulan > 1.048.576 baris xlsx)
diunggah sebagai SATU kelompok yang mengganti periode itu utuh dalam satu versi — tanpa heuristik
tumpang-tindih tanggal, tanpa aktivasi sebagian, ≤ PERIOD_MAX_FILES file. R21: otorisasi (T-016) tidak
berubah (owner-scope antrean); ekspor/Lihat data (T-017/T-058) membaca manifest apa adanya, jadi
beberapa segmen satu periode diurutkan (_period, ordinal) seperti segmen biasa.

## Acceptance criteria
- [x] Given bulan > 1.048.576 baris yang dipecah ke 3 file xlsx, when ketiganya diunggah sebagai satu kelompok untuk Maret 2026, then satu versi berisi 3 segmen Maret menggantikan seluruh Maret, dan mengunggah ulang kelompok yang sama menghasilkan data identik tanpa baris ganda
- [x] Given kelompok > PERIOD_MAX_FILES, then ditolak dengan pesan

## Risk
- Impact: invarian "satu segmen per periode per sheet" dilonggarkan HANYA untuk satu kelompok file lengkap
  (Segment.groupId/groupPart/groupSize, `segmentGroupProblem`) — rencana, manifest, gerbang integritas,
  recast, hapus/pulihkan, kartu Periode, meter kapasitas ikut. Antrean T-059 mendapat mode kelompok.
- Security (STRIDE): T — tidak ada append buta: >1 segmen per periode ditolak gerbang integritas kecuali
  satu kelompok lengkap; I/E — semua akses tetap owner-scope (NOT_FOUND), kunci objek diturunkan server
  (raw/<ds>/<groupVersionId>/part-<n>.<ext>); D — PERIOD_MAX_FILES (10) dicek sebelum antrean dibuat,
  kuota dipesan untuk total; R — AuditLog konfirmasi/rollback tidak berubah.
- Rollback: migrasi aditif `20261021110000_t060_period_group` (kolom nullable/default). Kode lama
  membaca versi kelompok sebagai "periode muncul lebih dari sekali" (gagal integritas, fail-closed) —
  jadi rollback kode hanya aman bila tidak ada segmen kelompok di manifest hidup (hapus/pulihkan dulu).
- Validation: unit (integrity, upload-plan, manage-plan, queue-plan, queue, period-ingest dengan
  DuckDB nyata, period-group, env), e2e `period-group` 1/1 + regresi period-queue/upload/review/
  manage/limits/mapping.

## Notes
- Keputusan (Q5 rencana: "bila jarang, tunda"): tidak ada data ukur frekuensi bulan > 1.048.576 baris di
  lingkungan ini; pemilik meminta semua task dituntaskan dan AC menuntut perilaku, jadi diimplementasikan.
- Desain: kelompok = antrean T-059 dengan `grouped` + `groupVersionId` (dipesan saat dibuat). Semua file
  diunggah dulu ke prefix versi kelompok; baru SATU versi PERIOD (groupFiles = daftar file) dibuat dan
  diproses worker sekaligus (parse per file → segmen per file per periode → satu rencana → satu commit).
  Rencana memperlakukan kelompok sebagai satu unggahan: periode di file mana pun diganti utuh oleh
  gabungan semua file. Sidik file = sha256 dari daftar sha (unggah ulang kelompok yang sama → "identik").
- Tidak pernah aktif sebagian: satu file gagal/dilewati sebelum lengkap → semua file dibatalkan; gagal
  saat giliran → semua gagal; file butuh pemetaan kolom / vonis cast < 98% → seluruh kelompok FAILED
  (pemetaan kelompok tidak didukung — asumsi: samakan judul kolom; kandidat task lanjutan bila perlu).
  groupFiles tidak terbaca → versi FAILED (bukan diproses file pertama saja).
- Batas: segmen per sheet (PERIOD_SHEET_MAX_SEGMENTS) menghitung setiap file kelompok. Deadline ingest
  60 menit berlaku untuk seluruh kelompok (10 file 1 GB bisa melewatinya → FAILED, data aktif tetap).
- AC1 dibuktikan dengan fixture kecil (3 file Maret: 2 CSV + 1 xlsx di unit; 3 CSV di e2e) — jalur
  identik dengan bulan > 1.048.576 baris; skala tidak diuji di sini (T-063).
- Sumber sel "Lihat data" untuk segmen kelompok memakai nama file bagian (Segment.originalName).
- Review putaran 1 (0 blokir): M1 file kelompok ber-sha256 sama (salinan) → kelompok ditolak dengan
  kedua nama file (regresi unit); L2 file kerja per bagian (sumber, salinan UTF-8, raw sheet diabaikan,
  raw + tabel periode setelah segmennya tertulis) dihapus; L3 sheet diabaikan disebut per file
  ("Ringkasan (maret-2.xlsx)"); L4 "identik" dinilai per periode dari sidik file yang memuat periode itu
  (IncomingSegmentRef.sha256), jatuh ke sidik unggahan bila tidak diketahui (regresi unit multi-periode).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan sama dengan T-059: browser → Server Action/Route Handler antrean (sesi, Origin, rate limit) → service `uploads/queue` (lock unggah pemilik + baris Dataset) → worker (versi kelompok) → Prisma/storage. Tidak ada data sensitif baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; aksi memakai `requireUser("action")` yang ada.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Diverifikasi: antrean/file kelompok tetap di-scope `queue.dataset.ownerId`; versi kelompok dibuat server di dataset pemilik; bukan pemilik → NOT_FOUND (unit queue.test.ts yang ada).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Diverifikasi: flag `group` zod boolean; file divalidasi `validateInit` seperti antrean; `groupFilesProblem` (2..PERIOD_MAX_FILES, satu periode); `groupFiles` dibaca ulang fail-closed (`parseGroupFiles`); kunci objek diturunkan server; tanpa SQL dari klien.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografi (sha256 hanya sidik file).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Diverifikasi: `{ok:false, code, message}` Bahasa Indonesia (LIMIT_REACHED/INVALID); galat kelompok di worker → pesan pemilik tanpa detail internal; log terstruktur (queueId, versionId, files).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Diverifikasi: hanya metadata file untuk pemilik; file kelompok yang batal/gagal dibuang; semua file kelompok di prefix versi → retensi 7 hari dan hapus dataset berlaku.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Diverifikasi: tanpa dependensi baru dan tanpa panggilan jaringan baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Diverifikasi: tidak pernah aktif sebagian (satu file gagal/dilewati → semua batal; gagal giliran → semua gagal; butuh pemetaan → FAILED), satu versi per kelompok di bawah lock (promosi sekali — unit), >1 segmen per periode hanya kelompok lengkap (gerbang integritas), batas segmen menghitung setiap file, PERIOD_MAX_FILES ditegakkan server.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Diverifikasi: file kelompok melewati validasi unggah yang sama (ekstensi, ukuran, ListParts/HeadObject, signature); kunci raw/<ds>/<groupVersionId>/part-<n>.<ext> dari id server.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Diverifikasi: input aksi buat antrean divalidasi zod; rate limit unggah yang sama; route file antrean tidak berubah.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Diverifikasi: env baru PERIOD_MAX_FILES (default 10, 2–36, divalidasi zod, di .env.example); npm audit hijau.
