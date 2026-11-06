---
id: T-jd1g
title: 'images.sh: tolak tag eksplisit yang tidak sesuai versi package.json'
status: done
profile: strict
tags:
  - deploy
created: "2026-11-06T16:25:36Z"
updated: "2026-11-06T16:34:25Z"
closed: "2026-11-06T16:34:25Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 343ac0c3ef2aaf66297dad38d72655e23848ddc5
paths:
  - deploy/images.sh
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T16:27:26Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T16:27:27Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 180243
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793982588572,"service":"data-dashboard","host":"127.0.0.1","port":46353,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793982607528,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793982607550,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793982607552,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793982607564,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793982618944,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793982618968,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3122 passed | 29 skipped (3151)
         Start at  16:28:28
         Duration  119.62s (tests 81%, import 16%, transform 3%)

          Isolate  236 workers spawned · ~95ms startup each (spawn + environment, per file)
                   at least ~7.41s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.8.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T16:30:29Z"
    tree: de96ea083abbf9a7cbfa0ed605ada0420bac069ca11cd262e903d99f87e277b9
  commits:
    - 1dc1a3a
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-06T16:30:29Z"
    passed: true
    tree: de96ea083abbf9a7cbfa0ed605ada0420bac069ca11cd262e903d99f87e277b9
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 465 dirs visited, 2522 inodes visited, 1 Extract calls, 55.094629ms elapsed, 55.094917ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.8.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given package.json 1.8.0, when images.sh build v1.8.1, then build ditolak dengan pesan (tanpa membangun)
- [x] Given package.json 1.8.1, when images.sh build v1.8.1 atau v1.8.1-r2, then build lanjut

## Risk
Impact: hanya skrip build image di mesin build (deploy/images.sh); aplikasi dan server tidak berubah.
Security (STRIDE): T — mencegah image bertag rilis berisi kode versi lain terpasang di produksi.
Rollback: revert commit.
Validation: uji stub 9 kasus; release.sh (tag dari package.json worktree tag) tetap lolos; review independen 0 temuan.

## Notes

- 2026-11-06T16:27:27Z Diuji dengan docker/git stub: pkg 1.8.0 menolak v1.8.1, v1.8.1-r2, v1.8.10; pkg 1.8.1 menerima v1.8.1 dan v1.8.1-r2, menolak v1.8.10; tag non-semver lolos; IMAGE_TAG_FORCE=1 lolos.

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
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi/panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — pengaman konfigurasi rilis

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T16:30:29Z (180243 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 1dc1a3a
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
