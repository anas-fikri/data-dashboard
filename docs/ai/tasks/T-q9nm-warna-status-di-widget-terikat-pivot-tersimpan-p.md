---
id: T-q9nm
title: Warna status di widget terikat pivot tersimpan + petunjuk Tabel; ikatan Simpan sebagai pivot tersimpan tidak ditimpa si…
status: done
profile: standard
tags:
  - ui
created: "2026-11-06T13:02:57Z"
updated: "2026-11-06T13:12:27Z"
closed: "2026-11-06T13:12:27Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: fd268b0afe05d44fa62bf816c38f104b1747dc0a
paths:
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/dashboards/widget-source.tsx
  - tests/e2e/status-colors.spec.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T13:05:38Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T13:05:38Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 166491
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793970465366,"service":"data-dashboard","host":"127.0.0.1","port":41023,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793970483699,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793970483721,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793970483725,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793970483737,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793970495871,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793970495885,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3122 passed | 29 skipped (3151)
         Start at  13:06:31
         Duration  114.27s (tests 81%, import 16%, transform 3%)

          Isolate  236 workers spawned · ~97ms startup each (spawn + environment, per file)
                   at least ~7.53s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.8.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T13:08:27Z"
    tree: d64044fb577349a4a1381c3fc37d33b3825433bd769f85fa3ddf3f97c5ef2b3f
  commits:
    - "0305653"
    - 2c75eb4
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-06T13:08:27Z"
    passed: true
    tree: d64044fb577349a4a1381c3fc37d33b3825433bd769f85fa3ddf3f97c5ef2b3f
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 453 dirs visited, 2472 inodes visited, 1 Extract calls, 75.739176ms elapsed, 75.739402ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.8.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given widget terikat pivot tersimpan (pivot/batang/angka), when panel dibuka, then ada petunjuk + tautan ke pivot tersimpan untuk Penilaian warna dan pilihan template bila nilainya berwarna
- [x] Given widget Tabel, when panel dibuka, then ada petunjuk bahwa warna status ada di Batang/Pivot/Angka
- [x] Given perubahan panel yang belum terkirim, when Simpan sebagai pivot tersimpan, then widget tetap terikat (tidak ditimpa simpanan mandiri)

## Risk
Impact: panel widget terikat/Tabel + alur Simpan sebagai pivot tersimpan; tanpa skema/migrasi baru (display.colors sudah diterima sejak v1.6.2).
Security (STRIDE): T — colors divalidasi skema tampilan widget di server; tidak ada endpoint baru.
Rollback: IMAGE_TAG prev-<stamp>.
Validation: e2e status-colors 5/5 (2×, termasuk sisir semua jenis + widget terikat + Lembut tertahan), widgets 27/27, unit 3.122; review 2 putaran (0 blokir terakhir).

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: tidak disentuh perubahan ini
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — akses widget terikat tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — display.colors divalidasi skema server
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — simpanan tertunda dikirim sebelum ikatan (antrean simpan berurutan)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T13:08:27Z (166491 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0305653, 2c75eb4
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
