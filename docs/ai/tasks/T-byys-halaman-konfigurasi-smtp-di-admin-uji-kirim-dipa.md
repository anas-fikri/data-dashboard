---
id: T-byys
title: Halaman konfigurasi SMTP di Admin (uji kirim, dipakai app dan notifikasi backup)
status: in_review
profile: standard
tags:
  - security
created: "2026-10-18T14:43:13Z"
updated: "2026-10-18T15:02:12Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: d200a8e9108ae4b0fc885043738cacf266cd9c12
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-18T15:01:57Z"
      findings: 3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 58156
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

      {"level":40,"time":1792335001723,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792335001746,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792335001749,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792335001761,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792335005269,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  148 passed (148)
            Tests  1931 passed (1931)
         Start at  21:49:49
         Duration  36.97s (tests 79%, import 16%, transform 5%)

          Isolate  148 workers spawned · ~149ms startup each (spawn + environment, per file)
                   at least ~2.30s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-18T14:50:28Z"
    tree: 1f4f0cfcb780018b21743618ec207479aa6a3451aaad5bdde74efeb2b3984b81
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin membuka Admin › Email, when halaman tampil, then pengaturan SMTP yang berlaku (dari aplikasi atau bawaan server) terisi tanpa menampilkan password
- [ ] Given admin mengisi host, port, keamanan, username, password, email dan nama pengirim lalu menekan Kirim email uji atau Simpan, then email uji terkirim ke alamat tujuan atau galat yang bisa ditindak tampil, dan pengaturan tersimpan (password tidak pernah dikirim balik, dicatat di log, audit, atau DB) serta audit tercatat
- [ ] Given pengaturan SMTP tersimpan, when aplikasi atau service backup mengirim email, then pengaturan itu yang dipakai tanpa restart atau edit .env; tanpa pengaturan aplikasi, SMTP_URL dari .env tetap dipakai

## Risk
Impact: halaman baru Admin › Email (form SMTP + email uji), src/lib/mail.ts (mailer dibuat ulang saat pengaturan berubah, mailFrom), src/features/auth/email.ts (pengirim dari mailFrom), deploy/backup.sh (email notifikasi memakai smtp.json tervalidasi, cadangan SMTP_URL), AuditAction smtp.settings.update/test. Penyimpanan app/smtp.json (600) di volume backup-config yang sudah ada; tanpa tabel/migrasi/env baru. Tanpa smtp.json perilaku sama dengan sebelumnya (SMTP_URL + MAIL_FROM).
Security (STRIDE): Spoofing — halaman/aksi hanya admin aktif; Tampering — isian divalidasi zod (host, port 1–65535, keamanan enum, username/password ASCII tercetak, email pengirim normalizeEmail, nama cleanLine); backup.sh (root) memvalidasi ulang setiap nilai smtp.json dengan jq dan menolak karakter kontrol sebelum menyusun konfigurasi curl (injeksi upload-file/url dibuktikan lalu ditutup). Repudiation — audit simpan dan email uji (server, tujuan; tanpa password). Information disclosure — password tidak pernah ke browser/RSC, log, audit, argumen proses (curl -K stdin); password yang berlaku hanya dipakai ulang untuk host+port+username yang sama tanpa turun ke teks polos (tidak bisa dibawa ke server penyerang lewat email uji). DoS — rate limit admin untuk simpan dan email uji; timeout transport 10/20 dtk. Elevation — root di container backup tidak mengeksekusi nilai dari app selain lewat jq/curl config ter-escape.
Rollback: hapus /backup-config/app/smtp.json (mailer kembali ke SMTP_URL tanpa restart) atau revert commit + redeploy; image sebelumnya ditag prev-*.
Validation: 15 tes unit SMTP (env parse, mapping keamanan, simpan 600 tanpa password keluar, password lintas server ditolak, audit uji, pemetaan galat, mailer dibuat ulang) + tes backup.sh (url/user ter-escape lewat stdin, STARTTLS ssl-reqd, cadangan SMTP_URL, injeksi baris baru ditolak, From RFC 2047) + e2e Admin › Email dengan Mailpit (uji gagal/berhasil, simpan, email lupa password memakai pengirim baru) + review independen + aitk check; kredensial produksi diuji kirim dari olympus ke mail.pcpexpress.com:465 (diterima server).

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — pengaturan SMTP di app/smtp.json (600) pada volume bersama; app menulis, mailer app dan backup.sh (root) membaca; root memvalidasi ulang semua nilai sebelum dipakai
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — kredensial SMTP adalah kredensial layanan, bukan login aplikasi; password tidak pernah dikirim balik dan hanya dipakai ulang untuk server+akun yang sama
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — halaman requireAdmin, Server Action currentAdmin (non-admin → NOT_FOUND); e2e non-admin 404
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod (host regex, port 1–65535, keamanan enum, username/password ASCII tercetak, normalizeEmail, cleanLine nama); backup.sh: jq -e validasi + curl_q escape \ dan " serta tolak karakter kontrol; From RFC 2047 bila tidak aman
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — password SMTP plaintext 600 di volume (setara SMTP_URL di .env.prod); tidak di DB sehingga tidak ikut arsip backup
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat nodemailer dipetakan ke pesan umum (EENVELOPE hanya respons server); log hanya kode/host; audit simpan + email uji tanpa password
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — password tidak ke browser/RSC/log/audit/argumen proses; SmtpView hanya hasPassword
- [x] V9 Communication: TLS for all external traffic; certificates validated — SSL/TLS (465) atau STARTTLS wajib (requireTLS); teks polos hanya bila admin memilih dan hanya relay lokal sebagai bawaan; verifikasi sertifikat aktif
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru (nodemailer sudah ada)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — password berlaku tidak bisa dialihkan ke host/port/username lain atau diturunkan ke teks polos; mailer dibuat ulang saat file berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — tulis atomik tmp unik (randomUUID) + rename, mode 600; backup.sh membaca hanya file biasa ≤ 64 KiB dengan timeout
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action memvalidasi argumen di service; rate limit per admin untuk simpan dan email uji
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa env wajib baru; SMTP_URL tetap cadangan; npm audit 0 kerentanan
