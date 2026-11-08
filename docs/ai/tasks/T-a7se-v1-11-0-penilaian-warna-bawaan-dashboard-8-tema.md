---
id: T-a7se
title: 'v1.11.0: penilaian warna bawaan dashboard + 8 tema grafik baru'
status: done
profile: strict
created: "2026-11-08T02:06:47Z"
updated: "2026-11-08T02:12:43Z"
closed: "2026-11-08T02:12:43Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 022c31bbec01dcb0486a191e629119159d84e238
paths:
  - CHANGELOG.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/13-widget-pivot.md
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - src/app/globals.css
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/dashboard-colors-control.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/dashboard-colors.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/whats-new/entries.ts
  - src/features/widgets/spec.ts
  - src/features/widgets/status-color.ts
  - src/features/widgets/tone.ts
  - tests/components/tone-options.test.ts
  - tests/e2e/chart-theme.spec.ts
  - tests/features/widgets/palette-contrast.test.ts
  - tests/features/widgets/status-color.test.ts
  - tests/features/widgets/tone-schema.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-08T02:07:03Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-08T02:07:03Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 131207
    summary: |-
      …ost":"127.0.0.1","port":40151,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794103734563,"service":"data-dashboard","host":"127.0.0.1","port":43905,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794103734654,"service":"data-dashboard","host":"127.0.0.1","port":39593,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794103734763,"service":"data-dashboard","host":"127.0.0.1","port":40565,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794103736232,"service":"data-dashboard","datasetId":"t072mw771i1hds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794103744430,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794103747908,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794103747930,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794103747932,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794103747940,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  239 passed | 1 skipped (240)
            Tests  3189 passed | 10 skipped (3199)
         Start at  02:07:56
         Duration  90.76s (tests 81%, import 16%, transform 3%)

          Isolate  240 workers spawned · ~77ms startup each (spawn + environment, per file)
                   at least ~6.07s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.10.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-08T02:09:28Z"
    tree: ac7ca84e0cd2755eb7db04eb36abac09874008d14ea9c4acff204ed719cbba18
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-08T02:09:35Z"
    passed: true
    tree: ac7ca84e0cd2755eb7db04eb36abac09874008d14ea9c4acff204ed719cbba18
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 516 dirs visited, 2967 inodes visited, 1 Extract calls, 53.005761ms elapsed, 53.00593ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.10.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Warna dashboard punya Penilaian warna bawaan (makin tinggi makin baik/buruk) yang diwarisi nilai Batang/Garis/Pai/Pivot tanpa penilaian sendiri, dengan pilihan Ikuti dashboard / Tanpa warna per nilai (juga di editor pivot tersimpan), serta 8 tema grafik populer baru dengan kontras ≥ 3:1 terang + gelap. Rilis v1.11.0 tanpa migrasi.

## Acceptance criteria
- [x] Given Penilaian warna bawaan diatur di Warna dashboard, when widget Batang/Garis/Pai/Pivot tanpa penilaian sendiri dirender (layar/PDF), then berwarna status sesuai arah bawaan
- [x] Given widget atau nilai pivot tersimpan memilih Tanpa warna, when dashboard punya penilaian bawaan, then tetap tanpa warna
- [x] Given tema grafik baru dipilih, when grafik dirender terang/gelap, then warna seri dari tema dengan kontras ≥ 3:1

## Risk
Impact: warna status semua widget dashboard (bawaan dashboard + 'Tanpa warna' per nilai) dan tema grafik; skema nilai widget menerima tone 'none', Dashboard.colors menerima tone + 8 tema baru (tanpa migrasi). Security (STRIDE): Tampering — semua field baru enum zod strict lewat route PATCH colors yang sama (sesi, origin, rate limit, canEditWhere) dan simpan widget yang sama; tanpa input bebas. Rollback: v1.10.0 menolak tone 'none' (widget tidak valid) dan tone/tema baru di Dashboard.colors (kembali bawaan) sampai roll-forward; runbook §21. Validation: vitest penuh (aitk check), e2e chart-theme/status-colors/widgets/pivot/chart-polish/exports, uji kontras tema, review subagen 2 putaran.

## Notes

- 2026-11-08T02:07:02Z Bukti: e2e chart-theme 5/5 (penilaian bawaan → legenda; Tanpa warna → hilang; tema Pantai --chart-1), status-colors 6, widgets 27, pivot 11, chart-polish 9, exports 8; unit specStatus/effectiveTone, toneOptions (editor pivot tersimpan → none), skema none/tone/tema, kontras 11 tema terang+gelap; review subagen: 1 blocking (Tanpa warna di editor pivot tersimpan) → diperbaiki → verifikasi 0.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas sama: route API → service canEditWhere → Prisma; data warna bukan data sensitif
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — tidak ada endpoint baru; PATCH colors + simpan widget tetap canEditWhere
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — tone/palette enum zod strict; warna tema statis di CSS, bukan input pengguna
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — input API divalidasi skema strict
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-08T02:09:28Z (131207 ms)
- Acceptance criteria: 3/3 satisfied
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
