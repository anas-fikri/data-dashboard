---
id: T-z1vv
title: 'Warna status v1.9: template di level dashboard (override per widget) + Tabel, Garis, Pai'
status: done
profile: strict
tags:
  - ui
created: "2026-11-06T22:53:38Z"
updated: "2026-11-06T23:48:38Z"
closed: "2026-11-06T23:48:38Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 7d1d4e00cf553ff989f29b99c92729da24845843
paths:
  - CHANGELOG.md
  - content/panduan/13-widget-pivot.md
  - deploy/images.sh
  - docs/runbook-deploy.md
  - prisma/migrations/20261107000000_dashboard_colors/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/api/dashboards/[id]/colors/route.ts
  - src/app/globals.css
  - src/components/dashboards/bound-config-model.ts
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/canvas-toolbar.tsx
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-colors-control.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/render/print-dashboard.tsx
  - src/components/render/print-table.tsx
  - src/components/widgets/chart-option.ts
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/dashboard-colors.tsx
  - src/components/widgets/table-expand.tsx
  - src/components/widgets/table-view.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/exports/render-session.ts
  - src/features/widgets/bound.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - src/features/widgets/status-color.ts
  - tests/components/bound-config.test.ts
  - tests/components/chart-status.test.ts
  - tests/e2e/status-colors.spec.ts
  - tests/features/dashboards/filter-columns.test.ts
  - tests/features/exports/render-session.test.ts
  - tests/features/widgets/bound.test.ts
  - tests/features/widgets/remap.test.ts
  - tests/features/widgets/status-color.test.ts
  - tests/features/widgets/tone-schema.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-06T23:34:24Z"
      findings: 8
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T23:41:09Z"
      findings: 4
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-06T23:44:58Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 165890
    summary: |-
      …st":"127.0.0.1","port":41751,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794008652976,"service":"data-dashboard","host":"127.0.0.1","port":36639,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794008653072,"service":"data-dashboard","host":"127.0.0.1","port":43723,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794008653174,"service":"data-dashboard","host":"127.0.0.1","port":35103,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794008654966,"service":"data-dashboard","datasetId":"t072mw5mfkuids000000","msg":"dataset dihapus"}
      {"level":40,"time":1794008663031,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794008673237,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794008673264,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794008673266,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794008673281,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  235 passed | 1 skipped (236)
            Tests  3155 passed | 10 skipped (3165)
         Start at  23:43:00
         Duration  111.86s (tests 80%, import 16%, transform 3%)

          Isolate  236 workers spawned · ~102ms startup each (spawn + environment, per file)
                   at least ~7.93s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.8.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T23:44:53Z"
    tree: 1a21b26be12e2a68b38a2d01edab0bf7f8049baeef4c1806cf57d1f0b99f6a74
  commits:
    - "3455182"
    - "9062618"
    - db12a13
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-06T23:44:59Z"
    passed: true
    tree: 1a21b26be12e2a68b38a2d01edab0bf7f8049baeef4c1806cf57d1f0b99f6a74
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 485 dirs visited, 2677 inodes visited, 1 Extract calls, 122.65359ms elapsed, 122.653771ms wall time
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
Template warna status melekat ke dashboard (tombol Warna dashboard; widget bawaan "Ikuti dashboard", bisa override per widget; widget terikat pivot tersimpan ikut dashboard), dan warna status tersedia di Garis (titik), Pai (irisan + swatch legenda), serta Tabel (per kolom angka) — layar dan PDF. Rilis v1.9.0 (migrasi Dashboard.colors).

## Acceptance criteria
- [x] Given template diatur di dashboard, when widget tanpa template sendiri dirender (layar/PDF), then memakai template dashboard
- [x] Given widget memilih template sendiri, when dirender, then template widget menang
- [x] Given Garis/Pai dengan penilaian warna, when dirender, then titik/irisan berwarna status + legenda
- [x] Given kolom angka tabel diberi penilaian warna, when dirender, then sel kolom itu berwarna status

## Risk
Impact: tampilan warna status semua widget dashboard (pivot, batang, garis, pai, Angka, tabel) di layar dan PDF; skema widget Tabel + tampilan tabel terikat bertambah field opsional; migrasi menambah kolom nullable Dashboard.colors. Security (STRIDE): Tampering/Elevation — PATCH /api/dashboards/[id]/colors lewat pembungkus mutation (sesi + CSRF/origin), updateMany dengan canEditWhere (pemilik/editor), id divalidasi bentuknya, body divalidasi colorsSchema strict (hex 6 digit, tanpa CSS bebas); Information disclosure — bukan pemilik/viewer: NOT_FOUND/FORBIDDEN seperti route dashboard lain. Rollback: image v1.8.x tanpa membatalkan migrasi (kolom diabaikan); widget Tabel berwarna/tabel terikat bertemplate sendiri tampil tidak valid sampai roll-forward (CHANGELOG Notes, runbook §18). Validation: vitest penuh, typecheck, lint, e2e status-colors (6 tes: garis/pai/tabel, sisir jenis, template dashboard layar+PDF, widget terikat), e2e widgets/chart-polish/pivot, review subagen.

## Notes

- 2026-11-06T23:42:06Z Bukti: e2e status-colors 6/6 (template dashboard layar+PDF, override widget, garis/pai/tabel berwarna, sisir jenis), widgets 27, chart-polish 9, pivot 11, filters 9, sharing 39 (ulang; sekali gagal flaky AC6 saat beban paralel), exports 8, mapping 3; vitest penuh hijau; review subagen 3 putaran (8 → 4 Low → verifikasi). Low L1–L3 → T-q3gm.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: route API → service (canEditWhere) → Prisma; data warna bukan data sensitif
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — updateMany where id + canEditWhere(userId); gagal → denied() membedakan NOT_FOUND/FORBIDDEN seperti route lain; diuji tests/features/dashboards/filter-columns.test.ts
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — colorsSchema zod strict (enum template, hex #RRGGBB), spec tabel strict + refine kolom ⊂ kolom tampil; warna dipakai sebagai nilai CSS variable/ECharts, bukan HTML
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat ke klien hanya kode + pesan umum ("Template warna tidak valid.")
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — simpan optimistis dengan rollback bila gagal; tidak ada batas/limit baru yang bisa disalahgunakan
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — input API divalidasi skema; mutation wrapper yang sama dengan route PATCH dashboard lain (rate limit/CSRF sama)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T23:44:53Z (165890 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 3455182, 9062618, db12a13
- Review pass 1 by claude-reviewer-subagent: 8 findings
- Review pass 2 by claude-reviewer-subagent: 4 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
