---
id: T-yye9
title: 'Download dashboard: PNG satu halaman + rapikan PDF snapshot (tombol mudah ditemukan, filter aktif tertulis)'
status: done
profile: strict
created: "2026-11-17T07:28:07Z"
updated: "2026-11-17T08:50:16Z"
closed: "2026-11-17T08:50:16Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: a6b1061893f6e90560de431ee5a1bb056f4da515
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
      at: "2026-11-17T08:09:18Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-17T08:18:48Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 206191
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794904711819,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794904715152,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794904715156,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794904715157,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  256 passed | 1 skipped (257)
            Tests  3413 passed | 10 skipped (3423)
         Start at  08:36:25
         Duration  135.87s (tests 81%, import 16%, transform 3%)

          Isolate  257 workers spawned · ~106ms startup each (spawn + environment, per file)
                   at least ~8.94s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.22.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T08:38:42Z"
    tree: 7a5f0af4b0eeef41f13d72411ea59d939c404bf6c0f5f7fe124c8f676fe71ec2
  commits:
    - 115d670
    - 77d1cfb
    - 944d177
    - a6b1061
    - a74bd58
    - e4e117a
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-17T08:46:16Z"
    passed: true
    tree: 7a5f0af4b0eeef41f13d72411ea59d939c404bf6c0f5f7fe124c8f676fe71ec2
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 559 dirs visited, 6229 inodes visited, 1 Extract calls, 101.047266ms elapsed, 101.047594ms wall time
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
Tombol kepala halaman menjadi 'Unduh dashboard' dengan pilihan PDF (A4 lanskap), Gambar (PNG satu halaman penuh) dan Halaman (HTML), semuanya snapshot sesuai filter aktif; teks status/galat menyebut format yang dipilih.

## Acceptance criteria
- [x] Panel 'Unduh dashboard' berisi PDF, Gambar (PNG), Halaman (HTML)
- [x] PNG halaman penuh (fullPage, skala 2) sesuai filter aktif
- [x] Pengumuman/galat menyebut format (PDF/Gambar/Halaman HTML)

## Risk
Impact: panel unduh kepala dashboard. Security (STRIDE): jalur sama dengan PDF (auth, batas laju, akses dicek ulang saat render). Rollback: image sebelumnya. Validation: uji unit pdf-export-ui, export-model.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — jalur render tetap: browser→API→antrean→renderer (token sekali pakai, tanpa URL); file HTML dibuka di luar origin app
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — token/sesi render sekali pakai 60 dtk tidak berubah (widgetId ikut klaim)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — createPdfExport cek akses dashboard + widgetId milik dashboard; sesi render cek ulang peran sekarang
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod: format enum, widgetId cuid, widgetId hanya png; HTML snapshot disanitasi (script/handler/URL non-#/data:image, CSS url/escape)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat renderer berkode tetap tanpa detail internal; audit dashboard.export / dashboard.widget.export
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — HTML hanya snapshot tampilan (tanpa data mentah); file kedaluwarsa + dihapus cleanup seperti PDF
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: lalu lintas internal sama dengan PDF
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — next 16.4.5 (perbaikan advisori); tanpa panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — batas laju + satu ekspor berjalan per sasaran sama dengan PDF; token sekali pakai (tanpa replay)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan; kunci S3 exports/<user>/<id>.<ext> dari regex tetap; renderer tidak menerima URL (tanpa SSRF)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — body POST tervalidasi zod strict; body renderer {token, format?} strict
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — next dinaikkan ke 16.4.5; aitk audit hijau

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-17T08:38:42Z (206191 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 115d670, 77d1cfb, 944d177, a6b1061, a74bd58, e4e117a
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
