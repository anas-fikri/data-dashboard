---
id: T-7psf
title: Backup off-VM diatur dari Admin, fallback simpan lokal + kirim ulang, notifikasi admin
status: in_review
profile: standard
tags:
  - security
created: "2026-10-18T13:25:38Z"
updated: "2026-10-18T14:26:59Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 628e5548c5469068726f116c6107186785fcdc39
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-18T14:01:10Z"
      findings: 7
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-18T14:11:13Z"
      findings: 3
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-18T14:16:28Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 60002
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

      {"level":40,"time":1792333480815,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792333480839,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792333480841,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792333480848,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792333483608,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  147 passed (147)
            Tests  1914 passed (1914)
         Start at  21:24:27
         Duration  37.18s (tests 79%, import 16%, transform 5%)

          Isolate  147 workers spawned · ~149ms startup each (spawn + environment, per file)
                   at least ~2.29s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-18T14:25:06Z"
    tree: a18d3ee4a15ac10e604c07e8d0b9cfe791db9e2178c7b0009ab46af7393d9eef
  audit:
    at: "2026-10-18T14:26:48Z"
    passed: true
    tree: 6e3877b9e712a53dd0bfb6fa7e781f3b6e1cdf05ab6bf1e50523c56ae60c5136
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 821 packages
          End status: 208 dirs visited, 1357 inodes visited, 1 Extract calls, 87.211375ms elapsed, 87.212ms wall time
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
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given admin membuka Admin › Backup, when mengisi endpoint S3, bucket, folder, access key, dan secret lalu menekan Tes koneksi atau Simpan, then koneksi diuji tulis-baca-hapus dengan pesan yang jelas, konfigurasi tersimpan tanpa secret pernah ditampilkan ulang atau dicatat di log/DB, audit tercatat, dan backup berikutnya memakai target itu tanpa edit .env atau SSH
- [x] Given target off-VM tidak terjangkau (down, jaringan, kunci salah), when backup harian berjalan, then arsip tetap dibuat dan ditahan di VM (tidak dihapus retensi lokal sebelum tersalin, kecuali melewati retensi penuh), dicoba kirim ulang tiap 30 menit, dan semua arsip tertunda tersalin begitu target terjangkau lagi
- [x] Given backup gagal atau salinan off-VM tertunda, when status berubah, then setiap admin aktif menerima email sekali per perubahan (termasuk saat pulih) dan admin melihat banner serta status di Admin › Backup; backup yang tidak berjalan > 26 jam juga tampil sebagai peringatan

## Risk
Impact: deploy/backup.sh (sumber target off-VM dari aplikasi, arsip ditahan saat target gagal, --sync tiap 30 menit, status.json, email admin), image backup (+jq, flock, cron sync, kepemilikan /backup-config), docker-compose (volume backup-config untuk app rw + backup rw; SMTP_URL/MAIL_FROM/APP_URL ke backup), Dockerfile app (/backup-config root + app/ milik app), halaman Admin › Backup + banner admin di shell, AuditAction backup.target.update. Tanpa tabel/migrasi baru, tanpa job worker baru (permintaan pemilik: tanpa perubahan arsitektur besar). Perilaku tanpa konfigurasi = sebelumnya (BACKUP_REMOTE / hanya di VM), retensi total kini max(BACKUP_RETENTION_DAYS, BACKUP_LOCAL_RETENTION_DAYS).
Security (STRIDE): Spoofing — halaman/aksi hanya admin aktif (requireAdmin/currentAdmin), banner hanya isAdmin. Tampering — /backup-config milik root 755, app hanya bisa menulis app/; backup.sh membaca offsite.json sekali (file biasa, timeout, ≤ 64 KiB, JSON objek; symlink/FIFO ditolak) dan semua nilai lewat jq → env rclone (bukan shell eval); isian divalidasi zod (endpoint = origin http/https ASCII, bucket S3, folder tanpa .., kunci ASCII tanpa baris baru). Repudiation — audit backup.target.update (meta tanpa secret, secretChanged). Information disclosure — secret hanya di app/offsite.json 600 (tidak di DB/arsip, log, audit, status.json, browser); kredensial SMTP/target lewat env/stdin curl, bukan argumen proses; tes koneksi hanya mengembalikan kelas galat. DoS — rate limit admin untuk simpan dan tes koneksi (tes timeout 15 dtk); rclone timeout 15/60 dtk; flock satu run. Elevation — root di container backup tidak menulis ke lokasi yang bisa diubah app (status lewat mktemp+mv di folder root, cache admin di /backups); dibuktikan tes symlink/FIFO + 3 putaran review independen.
Rollback: image lama ditag prev-20261018c (app/worker/renderer/backup) + arsip kode /data/docker-data/data-dashboard-prev-20261018c.tar.gz; kembalikan kode lama + `docker tag dashboard-*:prev-20261018c …:latest` + up -d. Volume backup-config boleh dibiarkan (tidak dibaca versi lama). Arsip di /backups tidak dihapus oleh perubahan ini (retensi justru lebih konservatif).
Validation: 10 tes skrip backup.sh dengan perintah tiruan (target mati → ditahan + email sekali; pulih → tersalin + email pulih; retensi; email gagal diulang; backup gagal; RCPT/Message-ID/CRLF; rclone gagal diam; retensi max; symlink; FIFO tanpa menggantung; cache admin di /backups) + 25 tes unit (validasi, file 600, secret tidak keluar, peringatan, pemetaan galat) + tes koneksi sungguhan ke RustFS (OK/secret salah/bucket salah/tak terjangkau 15 dtk) + e2e Admin › Backup 3/3 + aitk check; produksi: health, crontab 2 baris, kepemilikan volume, backup.sh nyata menulis status.json.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: app (uid 10001, internet) hanya menulis /backup-config/app; service backup (root) membaca sekali + menulis status di folder root; secret target hanya di file 600, tidak di DB
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak mengubah autentikasi; kredensial target/SMTP bukan kredensial login
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — halaman requireAdmin, Server Action currentAdmin (non-admin → NOT_FOUND), banner hanya isAdmin; e2e: non-admin 404 dan tanpa banner
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod: endpoint origin http/https ASCII tanpa kredensial/path, bucket aturan S3, folder tanpa ../spasi, region, kunci ASCII tanpa baris baru; bash memakai jq (bukan eval/source), status ditulis jq --arg; email header dari nilai tetap/DB
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — arsip tetap age (kunci publik); secret target disimpan plaintext 600 di volume (setara rclone.conf/.env.prod) — tidak di DB sehingga tidak ikut arsip
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — tes koneksi hanya kelas galat; log tanpa secret (actorId, enabled); galat rclone dipotong 300 karakter tanpa kredensial; kegagalan tulis konfigurasi → pesan umum
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — secret tidak pernah dikirim ke browser (hasSecret saja), tidak di audit/status/log; daftar email admin hanya di /backups (root)
- [x] V9 Communication: TLS for all external traffic; certificates validated — endpoint https disarankan; http hanya untuk LAN (SigV4 tidak mengirim secret); SMTP lewat SMTP_URL yang ada (smtps)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi npm baru; image backup menambah paket Alpine resmi jq + flock (diverifikasi di olympus)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — arsip tidak dibuang sebelum tersalin (marker per target), retensi total max(30, lokal); flock satu run; email sekali per perubahan status; konfigurasi rusak = failed tanpa fallback/pulih palsu; symlink/FIFO/tukar file diuji
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — offsite.json dibaca hanya bila file biasa ≤ 64 KiB dengan timeout; tulis atomik (tmp + rename) mode 600; status lewat mktemp+mv di folder root; tes koneksi = SSRF terbatas admin + rate limit, hanya kelas galat
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action memvalidasi argumen di service; rate limit per admin untuk simpan dan tes koneksi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — volume baru dengan kepemilikan root/app ditetapkan image + CMD + backup.sh; tanpa env wajib baru untuk app; npm audit 0 kerentanan
