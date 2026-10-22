---
id: T-k2ec
title: Editor dashboard boleh mengatur kolom filter dari bilah filter
status: in_review
profile: standard
tags:
  - ui
  - security
created: "2026-10-22T03:19:58Z"
updated: "2026-10-22T10:45:54Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 68fde9f7659a6526e4e6ad1512dde1195d7f0d25
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T10:45:54Z"
      findings: 8
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 251639
    summary: |-
      …Usage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}
      {"level":40,"time":1792665083486,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792665083514,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792665083524,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792665083536,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792665086201,"service":"data-dashboard","host":"127.0.0.1","port":33207,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792665086260,"service":"data-dashboard","host":"127.0.0.1","port":34853,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792665086364,"service":"data-dashboard","host":"127.0.0.1","port":40695,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792665086478,"service":"data-dashboard","host":"127.0.0.1","port":33839,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}

       Test Files  224 passed | 3 skipped (227)
            Tests  3034 passed | 29 skipped (3063)
         Start at  10:30:01
         Duration  189.07s (tests 82%, import 15%, transform 3%)


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T10:33:12Z"
    tree: ad5397c74baa6cc9d9ce071d2137ece2daa3ebc0ff73baf9dda0f38533557a0a
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Pemilik dan editor dashboard bisa menambah/menghapus kolom filter langsung di bilah filter mode edit tanpa gulir ke kartu pengaturan; viewer tetap tidak bisa (404/403 sesuai konvensi)
- [ ] Viewer tetap hanya mengirim {widgetId, dashboardFilters} untuk kolom filter yang terdaftar
- [ ] Panduan 08 editor diperbarui (keputusan pemilik 2026-10-22: editor boleh menambah filter)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
