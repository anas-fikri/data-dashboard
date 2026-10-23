---
id: T-cfd7
title: 'Hotfix keamanan: naikkan Next.js 16.4.0 → 16.4.2 (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr)'
status: in_review
profile: strict
profile_pinned: true
tags:
  - security
created: "2026-10-23T01:35:50Z"
updated: "2026-10-23T02:48:11Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f21a6ecbde85af8c204e98d04e3b0df5ae7e4abd
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-23T02:36:01Z"
      findings: 4
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T02:37:15Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-23T02:42:58Z"
      findings: 2
    - "n": 4
      by: claude-reviewer-subagent
      at: "2026-10-23T02:43:58Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 209925
    summary: |-
      …tasetId":"t072mvkd6m1vds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792723331339,"service":"data-dashboard","host":"127.0.0.1","port":45303,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792723331391,"service":"data-dashboard","host":"127.0.0.1","port":41803,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792723331490,"service":"data-dashboard","host":"127.0.0.1","port":44753,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792723331596,"service":"data-dashboard","host":"127.0.0.1","port":38127,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792723342215,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792723353742,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792723353763,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792723353768,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792723353781,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  228 passed | 1 skipped (229)
            Tests  3075 passed | 10 skipped (3085)
         Start at  02:40:52
         Duration  123.70s (tests 81%, import 15%, transform 3%)

          Isolate  229 workers spawned · ~120ms startup each (spawn + environment, per file)
                   at least ~9.01s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.4.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-23T02:42:57Z"
    tree: baf74f6472b135b3a740062a134478374089e8d1a65a37abab0a982e810e4f7d
  audit:
    at: "2026-10-23T02:43:59Z"
    passed: true
    tree: baf74f6472b135b3a740062a134478374089e8d1a65a37abab0a982e810e4f7d
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 452 dirs visited, 2359 inodes visited, 1 Extract calls, 74.659016ms elapsed, 74.659248ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.4.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Tutup tiga advisori Next.js yang terbit setelah rilis v1.4.0 dan dilaporkan `npm audit` sebagai critical untuk next 16.0.0–16.4.0: RCE tanpa autentikasi di Image Optimization API dengan SVG (GHSA-2464-fhr4-w9xw), DoS App Router lewat Server Actions (GHSA-p3m5-59mp-jv5r), dan RCE di fungsi `use cache` yang mengembalikan typed array (GHSA-673q-mjm6-r5xr). Aplikasi memakai next/image dan Server Actions. Next dinaikkan ke 16.4.2 (patch, rentang ^16.4.0); lockfile hanya berubah di next/@next/*.

## Acceptance criteria
- [x] npm audit (prod) tanpa kerentanan critical/high; next di lockfile ≥ 16.4.1
- [x] aitk check, aitk audit, dan suite e2e penuh per proyek lulus dengan Next.js baru
- [ ] Rilis patch v1.4.1 + runbook deploy untuk pemilik

## Risk
Impact: seluruh app (framework patch 16.4.0 → 16.4.2); tanpa perubahan kode/migrasi. Security (STRIDE): menutup Elevation/RCE + DoS di framework. Rollback: image v1.4.0 (`upgrade.sh rollback`), tetapi kembali rentan — hanya sementara. Validation: npm audit 0, aitk check, aitk audit, next build, suite e2e penuh per proyek.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa perubahan data
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa komunikasi baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa perubahan upload
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
