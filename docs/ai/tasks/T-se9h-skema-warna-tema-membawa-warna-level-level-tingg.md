---
id: T-se9h
title: 'Skema warna: tema membawa warna level; level tinggi/normal/rendah otomatis aktif bawaan (arah makin tinggi makin baik),…'
status: in_review
profile: strict
created: "2026-11-17T07:28:08Z"
updated: "2026-11-17T08:31:37Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 115d670758b76a83a203fa455ed07dd50760fe52
paths:
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - package-lock.json
  - package.json
  - prisma/migrations/20261117000000_export_png_html/migration.sql
  - prisma/schema.prisma
  - renderer/render.ts
  - renderer/renderer.ts
  - src/components/dashboards/dashboard-colors-control.tsx
  - src/components/dashboards/dashboard-pdf-export.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/widgets/dashboard-colors.tsx
  - src/components/widgets/export-menu.tsx
  - src/components/widgets/export-model.ts
  - src/components/widgets/export-status.tsx
  - src/features/exports/filename.ts
  - src/features/exports/http.ts
  - src/features/exports/pdf-job.ts
  - src/features/exports/render-session.ts
  - src/features/exports/render-token.ts
  - src/features/exports/renderer-client.ts
  - src/features/exports/repo.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/exports/types.ts
  - src/features/whats-new/entries.ts
  - src/features/widgets/tone.ts
  - src/lib/storage/exports.ts
  - tests/components/pdf-export-ui.test.ts
  - tests/e2e/chart-theme.spec.ts
  - tests/e2e/exports.spec.ts
  - tests/e2e/kpi-drill.spec.ts
  - tests/e2e/status-colors.spec.ts
  - tests/features/exports/pdf-job.test.ts
  - tests/features/exports/render-formats.test.ts
  - tests/features/widgets/tone-schema.test.ts
  - tests/renderer/render.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T08:18:49Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 200466
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794904281657,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794904285776,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794904285778,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794904285780,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  256 passed | 1 skipped (257)
            Tests  3413 passed | 10 skipped (3423)
         Start at  08:29:21
         Duration  134.30s (tests 81%, import 16%, transform 3%)

          Isolate  257 workers spawned · ~105ms startup each (spawn + environment, per file)
                   at least ~8.88s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.22.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T08:31:36Z"
    tree: 7a5f0af4b0eeef41f13d72411ea59d939c404bf6c0f5f7fe124c8f676fe71ec2
  commits:
    - 115d670
    - 77d1cfb
    - a6b1061
    - a74bd58
    - e4e117a
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-17T08:24:25Z"
    passed: true
    tree: 7a5f0af4b0eeef41f13d72411ea59d939c404bf6c0f5f7fe124c8f676fe71ec2
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 559 dirs visited, 6227 inodes visited, 1 Extract calls, 120.064594ms elapsed, 120.064833ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.22.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Level tinggi/sedang/rendah aktif otomatis di semua dashboard: penilaian bawaan dashboard yang belum diatur = 'makin tinggi makin baik'; dashboard bisa memilih 'Tanpa warna', widget tetap bisa membalik arah atau mematikan. Warna level mengikuti tema grafik bila template status belum dipilih (Ramah buta warna → biru–oranye; tema bersaturasi tinggi → Tegas; lainnya → Lembut).

## Acceptance criteria
- [x] Dashboard tanpa pengaturan: level otomatis aktif (makin tinggi makin baik)
- [x] Dashboard bisa memilih Tanpa warna; widget bisa membalik/mematikan
- [x] Warna level ikut tema grafik bila template belum dipilih; pilihan template sendiri menang

## Risk
Impact: tampilan semua dashboard lama berubah (nilai yang belum punya penilaian kini berwarna) — disetujui pemilik. Security (STRIDE): tanpa perubahan akses; skema tone dashboard menerima 'none' (enum tetap). Rollback: image sebelumnya; dashboard yang menyimpan tone 'none' akan ditolak skema versi lama → warna dashboard itu dibaca tidak valid (cek pembacaan) — risiko kecil, catat di runbook. Validation: uji unit tone-schema, e2e status-colors, chart-theme, kpi-drill.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — jalur render tetap: browser→API→antrean→renderer (token sekali pakai, tanpa URL); file HTML dibuka di luar origin app
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — token/sesi render sekali pakai 60 dtk tidak berubah (widgetId ikut klaim)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: endpoint warna yang ada (pemilik/editor)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — skema tone enum up/down/none (zod)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat renderer berkode tetap tanpa detail internal; audit dashboard.export / dashboard.widget.export
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya pengaturan tampilan
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: lalu lintas internal sama dengan PDF
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — next 16.4.5 (perbaikan advisori); tanpa panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya pengaturan tampilan
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — PATCH warna tervalidasi dashboardColorsSchema strict
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — next dinaikkan ke 16.4.5; aitk audit hijau

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-17T08:31:36Z (200466 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 115d670, 77d1cfb, a6b1061, a74bd58, e4e117a
- Review pass 1 by claude-reviewer-subagent: 0 findings
