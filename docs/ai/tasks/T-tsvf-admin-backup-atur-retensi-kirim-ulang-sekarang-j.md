---
id: T-tsvf
title: 'Admin › Backup: atur retensi, kirim ulang sekarang + jeda bertahap, sisa ruang NAS, daftar arsip'
status: in_review
profile: strict
profile_pinned: true
tags:
  - security
  - backup
created: "2026-11-09T12:30:24Z"
updated: "2026-11-09T13:09:35Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 3b2fd96e4d421eff4cc11131823355daae87cc31
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-09T13:06:07Z"
      findings: 8
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-09T13:09:35Z"
      findings: 1
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 169708
    summary: |-
      …st":"127.0.0.1","port":33375,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794228848107,"service":"data-dashboard","host":"127.0.0.1","port":41107,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794228848206,"service":"data-dashboard","host":"127.0.0.1","port":33919,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794228848309,"service":"data-dashboard","host":"127.0.0.1","port":43835,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794228848598,"service":"data-dashboard","datasetId":"t072mw99j3crds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794228858888,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794228864368,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794228864390,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794228864392,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794228864406,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  239 passed | 1 skipped (240)
            Tests  3222 passed | 10 skipped (3232)
         Start at  12:52:49
         Duration  114.50s (tests 82%, import 15%, transform 3%)

          Isolate  240 workers spawned · ~88ms startup each (spawn + environment, per file)
                   at least ~6.93s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.12.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-09T12:54:45Z"
    tree: cec7e4a7213d5c83e25a5bea89e99d1ff06d31cbd420885718892965b507208a
---

## Objective
Admin mengelola backup sepenuhnya dari Admin › Backup tanpa mengedit .env.prod: mengatur lama simpan arsip di server dan di NAS, meminta kirim ulang ke NAS seketika, melihat daftar arsip (tanggal, ukuran, sudah di NAS atau belum) beserta ruang disk server, melihat sisa ruang NAS dari Tes koneksi, dan membaca petunjuk galat yang bisa ditindak. Saat NAS menolak menyimpan (penuh/kuota habis) kirim ulang dijeda bertahap agar tidak mengunggah GB sia-sia tiap 30 menit.

## Acceptance criteria
- [ ] Given admin menyimpan retensi server N hari dan NAS M hari di Admin › Backup, when backup harian atau kirim ulang berjalan, then backup.sh memakai nilai itu (divalidasi ulang, NAS minimal 7 hari, arsip tertunda tidak dibuang sebelum max(N,M) hari) dan status menampilkan nilai yang berlaku
- [ ] Given ada arsip tertunda, when admin menekan Kirim ulang sekarang, then dalam ±1 menit backup.sh --tick menjalankan kirim ulang walau sedang dijeda, permintaan tercatat di audit, dan dibatasi rate limit
- [ ] Given NAS menolak menyimpan (SSH_FX_FAILURE/penuh), when kirim ulang gagal berturut-turut, then jadwal berikutnya dijeda 30 menit → 1 → 2 → 4 jam (maks 4 jam), status menampilkan jadwal berikutnya, dan berhasil sekali mengembalikan jeda normal
- [ ] Given halaman Admin › Backup, when status backup terbaca, then tampil daftar arsip di server (tanggal, ukuran, sudah/belum di NAS), total ruang arsip + sisa disk server, ringkasan arsip di NAS, dan petunjuk galat berbahasa awam
- [ ] Given Tes koneksi berhasil dan NAS mendukung statvfs, when hasil tampil, then sisa ruang volume NAS ditampilkan (dengan catatan kuota DSM) dan diberi peringatan bila kurang dari 2 × arsip terakhir

## Risk
Impact: Admin › Backup (src/features/backup/*, components/admin/backup-*/retention-form/sync-now), deploy/backup.sh (dijalankan root di service backup) dan crontab image backup (--tick tiap menit). Tanpa migrasi DB; status.json bertambah field (pembaca lama mengabaikannya), file baru app/retention.json dan app/sync-request (ditulis app), running.json (ditulis root).
Security (STRIDE): Tampering — app yang dibobol bisa menulis retention.json/sync-request: backup.sh memvalidasi ulang (bilangan bulat, NAS ≥ 7 hari, server ≥ 3 hari; symlink/FIFO lewat app_json ditolak), isi sync-request tidak pernah dibaca dan hanya dihapus (rm pada symlink hanya menghapus tautannya); Denial of service — permintaan kirim ulang dibatasi sekali per 5 menit di backup.sh + rate limit aksi admin, jeda bertahap saat NAS penuh mengurangi unggahan sia-sia; Information disclosure — status/running tanpa rahasia, sisa ruang NAS hanya angka; Elevation — aksi baru lewat currentAdmin + audit (backup.retention.update/reset, backup.sync.request); Repudiation — audit dengan IP.
Rollback: revert commit + deploy ulang; retention.json/sync-request diabaikan versi lama (retensi kembali ke .env.prod), field status baru diabaikan; hapus app/sync-request sisa (runbook §22).
Validation: tests/scripts/backup-offsite.test.ts (38 tes: retensi app/invalid/symlink, jeda 30→240 menit, --tick + batas 5 menit, symlink permintaan, status rusak, isi status), tests/features/backup (validasi lama simpan, audit, permintaan, statvfs, status lama/baru, format), e2e backup (status lengkap, kirim ulang + pemantauan, lama simpan, axe tanpa pelanggaran serius), aitk check hijau.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan sama dengan T-7psf: app (uid 10001) hanya menulis di backup-config/app; root membaca lewat app_json dan memvalidasi ulang; file root (status.json, running.json) di folder root 755
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Aksi baru (simpan/reset lama simpan, kirim ulang, status kirim ulang) lewat currentAdmin (admin aktif dari DB, selain itu NOT_FOUND); halaman requireAdmin
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Lama simpan divalidasi zod (bilangan bulat dalam batas) dan ulang di backup.sh dengan jq; angka dari status.json lama disaring regex sebelum aritmetika bash; isi sync-request tidak dibaca; tanpa interpolasi ke perintah shell
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat tulis config dicatat kode errno saja; pesan ke admin generik; audit tanpa rahasia
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tanpa dependensi baru; rclone about/lsjson ke target NAS yang sama yang sudah dipin kunci hostnya
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Kirim ulang paling sering 1×/5 menit (backup.sh) + rate limit admin; permintaan yang belum diambil tidak ditulis ulang/diaudit ulang; flock satu run, --tick/--sync yang bentrok dilewati tanpa menghapus permintaan; NAS minimal 7 hari agar riwayat tidak bisa dihapus lewat aplikasi; arsip tertunda tetap tidak dibuang sebelum max(server, NAS) hari
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — retention.json dibaca hanya bila file biasa ≤ 64 KiB (app_json); sync-request symlink → hanya tautan yang dihapus (diuji); tulis atomik mode 600
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action dengan skema zod dan BackupResult; rate limit per admin untuk aksi tulis; pemantauan status hanya baca untuk admin
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Batas bawah aman bawaan (NAS 7, server 3 hari); tanpa header/konfigurasi produksi lain yang berubah
