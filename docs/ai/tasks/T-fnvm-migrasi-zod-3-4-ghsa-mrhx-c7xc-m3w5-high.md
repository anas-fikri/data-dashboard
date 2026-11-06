---
id: T-fnvm
title: Migrasi zod 3 → 4 (GHSA-mrhx-c7xc-m3w5, high)
status: done
profile: strict
created: "2026-10-24T00:31:02Z"
updated: "2026-11-06T10:49:27Z"
closed: "2026-11-06T10:49:27Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 2b332144e9b115ace8b62b0fc7ef57bf9945d8c3
paths:
  - .github/workflows/ci.yml
  - Dockerfile
  - content/panduan/13-widget-pivot.md
  - deploy/backup.sh
  - docker-compose.prod.yml
  - docs/runbook-deploy.md
  - package-lock.json
  - package.json
  - playwright.config.ts
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/render/print-pivot.tsx
  - src/components/widgets/chart-option.ts
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/pivot-markup.tsx
  - src/components/widgets/pivot-view.tsx
  - src/components/widgets/status-legend.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/query/spec.ts
  - src/features/widgets/bound.ts
  - src/features/widgets/spec.ts
  - src/features/widgets/status-color.ts
  - src/features/widgets/tone.ts
  - src/lib/monitor.ts
  - src/worker/index.ts
  - src/worker/monitor-job.ts
  - tests/e2e/status-colors.spec.ts
  - tests/features/widgets/bound.test.ts
  - tests/features/widgets/status-color.test.ts
  - tests/features/widgets/tone-schema.test.ts
  - tests/lib/monitor.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T10:32:57Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T10:36:13Z"
      findings: 0
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-06T10:36:15Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 163469
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793961906485,"service":"data-dashboard","host":"127.0.0.1","port":40747,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793961922196,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793961922220,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793961922225,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793961922237,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793961937838,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793961937854,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3122 passed | 29 skipped (3151)
         Start at  10:43:54
         Duration  113.29s (tests 82%, import 15%, transform 3%)

          Isolate  236 workers spawned · ~95ms startup each (spawn + environment, per file)
                   at least ~7.36s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T10:45:49Z"
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
  commits:
    - 0b900f3
    - 2b33214
    - 3d6b854
    - 3db23b5
    - 4fcedbe
    - 5448b90
    - 7e996ac
    - 8124f7c
    - 850026f
    - 88ad754
    - 95b7bc9
    - 9ab9fd1
    - a2d6c0a
    - b1e545a
    - b285387
    - b714998
    - c0fdc24
    - c9d3a79
    - ccd8e58
    - d271413
    - d5d36a3
    - da9dbbf
    - ddfd307
    - def261a
    - eae474e
    - ef427f1
    - f68d56b
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-06T10:45:54Z"
    passed: true
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 438 dirs visited, 2361 inodes visited, 1 Extract calls, 58.461288ms elapsed, 58.461441ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.7.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Advisori GHSA-mrhx-c7xc-m3w5 (high, 2026-10-24): zod < 4.6.6 bisa menghabiskan memori saat memvalidasi koleksi berbatas yang sangat besar; semua zod 3.x terdampak, perbaikan hanya di zod 4. Migrasi ±30 file `from "zod"` ke zod ≥ 4.6.7 (pesan galat, `z.record`, `.default`, `error` map, `zod-validation-error` di eslint-plugin-react-hooks hanya dev). Keputusan pemilik 2026-10-24: rilis v1.5.1 (fix gerbang deploy) dulu, zod sesudahnya (v1.5.2). Selama itu `aitk check` merah karena npm audit (prod high); risiko rendah karena body JSON API dibatasi ukurannya sebelum validasi (src/lib/http-body.ts).

## Acceptance criteria
- [x] npm run audit (prod high) hijau dengan zod ≥ 4.6.7
- [x] typecheck + seluruh unit test lulus tanpa ubah perilaku

## Risk
Impact: semua validasi input (spec widget, query, server action) memakai zod; perilaku harus sama. Pesan bawaan zod (bukan pesan khusus aplikasi) bisa berubah teks.
Security (STRIDE): D (denial of service) — menutup GHSA-mrhx-c7xc-m3w5 (memori habis saat validasi koleksi besar); tidak ada perubahan aturan validasi (S/T/E tidak berubah).
Rollback: tanpa migrasi DB; kembalikan image ke prev-<stamp> (runbook §11).
Validation: typecheck + 3.106 unit test lulus; npm run audit prod 0 kerentanan; e2e belum (butuh layanan).

## Notes

- 2026-11-06T09:40:27Z zod 4.6.7: hanya 2 penyesuaian tipe ctx.addIssue (query/spec.ts, widgets/spec.ts). 3.106 unit test lulus. e2e belum dijalankan (butuh layanan); pesan galat bawaan zod untuk kunci asing berubah teks tetapi pesan khusus aplikasi tetap.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tidak berubah; zod tetap di sisi server untuk semua input
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak menyentuh kontrol akses
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — aturan validasi sama (3.106 unit test lulus), hanya versi pustaka
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak menyentuh kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan galat dari skema aplikasi, bukan internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak menyentuh data pribadi
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak menyentuh jaringan
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — zod resmi dari npm, versi dipin di lockfile
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: logika bisnis tidak berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: unggahan tidak berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — skema input API tetap; batas body sebelum validasi tetap
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — dependensi diperbarui: advisori high ditutup, audit prod 0

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T10:45:49Z (163469 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 0b900f3, 2b33214, 3d6b854, 3db23b5, 4fcedbe, 5448b90, 7e996ac, 8124f7c, 850026f, 88ad754, 95b7bc9, 9ab9fd1, a2d6c0a, b1e545a, b285387, b714998, c0fdc24, c9d3a79, ccd8e58, d271413, d5d36a3, da9dbbf, ddfd307, def261a, eae474e, ef427f1, f68d56b
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
