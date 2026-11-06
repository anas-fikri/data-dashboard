---
id: T-3xgk
title: 'CI GitHub Actions: lint, typecheck, unit test per PR'
status: in_progress
profile: standard
tags:
  - ci
created: "2026-11-06T09:29:30Z"
updated: "2026-11-06T10:26:05Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: c0fdc24ef61ec27d14d6bc18e09c3577b7d03ac4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 160935
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793960709470,"service":"data-dashboard","host":"127.0.0.1","port":35137,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793960726858,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793960726881,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793960726887,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793960726900,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793960739649,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793960739669,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3120 passed | 29 skipped (3149)
         Start at  10:24:00
         Duration  110.83s (tests 81%, import 15%, transform 3%)

          Isolate  236 workers spawned · ~95ms startup each (spawn + environment, per file)
                   at least ~7.39s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T10:25:52Z"
    tree: e696f8b99ce70ec3fab15f430581cce0ba1466b28c8ee93b9192e8d98da48d87
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given PR ke main, when dibuka/di-push, then workflow menjalankan lint + typecheck + vitest dan gagal bila ada yang merah

## Risk
Impact: hanya CI (GitHub Actions); kode aplikasi tidak berubah.
Security (STRIDE): E — workflow berizin contents:read saja, tanpa secret, hanya event pull_request (fork tanpa akses secret) dan push main.
Rollback: hapus .github/workflows/ci.yml.
Validation: run pertama di PR #8 lulus (lint, typecheck, vitest) dalam 4 menit.

## Notes

- 2026-11-06T10:23:10Z CI berjalan di PR #8: job check lulus (4 menit) pada d271413.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: tidak disentuh perubahan ini
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — action resmi actions/checkout@v4 dan actions/setup-node@v4, npm ci dari lockfile
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — permissions contents:read, concurrency membatalkan run lama
