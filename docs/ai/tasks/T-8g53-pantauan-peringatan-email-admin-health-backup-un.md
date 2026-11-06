---
id: T-8g53
title: Pantauan + peringatan email admin (health, backup, unggah gagal)
status: done
profile: strict
tags:
  - ops
created: "2026-11-06T09:29:30Z"
updated: "2026-11-06T10:55:49Z"
closed: "2026-11-06T10:55:49Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: b1e545a9b98e9b3c314112f6ffe337359d9c96aa
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
      at: "2026-11-06T10:32:56Z"
      findings: 2
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
    duration_ms: 160832
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793962296053,"service":"data-dashboard","host":"127.0.0.1","port":46343,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793962311611,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793962311633,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793962311637,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793962311646,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793962325471,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793962325493,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3122 passed | 29 skipped (3151)
         Start at  10:50:27
         Duration  109.22s (tests 81%, import 16%, transform 3%)

          Isolate  236 workers spawned · ~95ms startup each (spawn + environment, per file)
                   at least ~7.39s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T10:52:17Z"
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
  commits:
    - 2b33214
    - 8124f7c
    - 850026f
    - 95b7bc9
    - 9ab9fd1
    - b1e545a
    - b714998
    - d271413
    - f68d56b
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-06T10:52:18Z"
    passed: true
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 438 dirs visited, 2362 inodes visited, 1 Extract calls, 56.767345ms elapsed, 56.767599ms wall time
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
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given layanan/backup bermasalah atau unggah gagal melonjak, when job pantauan 15 menit jalan, then admin menerima email sekali saat berubah status (+ pengingat 6 jam) dan email pulih
- [x] Tanpa migrasi DB; unit test lulus

## Risk
Impact: job worker baru tiap 15 menit + email admin; worker memasang volume baru backup-status (read-only) berisi salinan status.json.
Security (STRIDE): I — worker TIDAK memasang backup-config (password NAS/SMTP), hanya status tanpa rahasia; isi email tanpa rahasia (detail health lewat safeMessage); D — status kirim di Redis mencegah banjir email (berubah/6 jam/pulih).
Rollback: IMAGE_TAG prev-<stamp>; volume backup-status boleh tetap ada.
Validation: unit monitor.test; nyata di layanan dev: storage mati → email, ulang → diam, pulih → email; PostgreSQL mati → email (daftar admin dari Redis); review 3 putaran.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: worker hanya membaca status backup tanpa rahasia
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — log tanpa rahasia; email tanpa detail koneksi
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — hanya alamat email admin aktif (di Redis untuk cadangan)
- [x] V9 Communication: TLS for all external traffic; certificates validated — SMTP dari SMTP_URL .env (TLS sesuai konfigurasi yang sudah ada)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — anti-banjir: kirim saat berubah, pengingat 6 jam
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — volume read-only, tanpa izin tambahan

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T10:52:17Z (160832 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 2b33214, 8124f7c, 850026f, 95b7bc9, 9ab9fd1, b1e545a, b714998, d271413, f68d56b
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
