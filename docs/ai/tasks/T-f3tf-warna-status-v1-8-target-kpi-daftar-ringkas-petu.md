---
id: T-f3tf
title: 'Warna status v1.8: target, KPI, daftar ringkas, petunjuk garis/pai, terapkan template ke semua widget'
status: done
profile: strict
tags:
  - ui
created: "2026-11-06T09:29:29Z"
updated: "2026-11-06T11:02:11Z"
closed: "2026-11-06T11:02:11Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 95b7bc9903101e20b5b8e66a9a0d7b2cdd0aa5c9
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
      at: "2026-11-06T10:32:55Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-06T10:36:12Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-06T10:36:14Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 165165
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793962674176,"service":"data-dashboard","host":"127.0.0.1","port":38189,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793962692981,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793962693004,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793962693006,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793962693020,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793962700579,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793962700600,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  233 passed | 3 skipped (236)
            Tests  3122 passed | 29 skipped (3151)
         Start at  10:56:41
         Duration  113.52s (tests 82%, import 15%, transform 3%)

          Isolate  236 workers spawned · ~94ms startup each (spawn + environment, per file)
                   at least ~7.32s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T10:58:36Z"
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
  commits:
    - 2b33214
    - 8124f7c
    - 850026f
    - 8c0eaa9
    - 95b7bc9
    - 9ab9fd1
    - b1e545a
    - b714998
    - d271413
    - f68d56b
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-06T10:58:37Z"
    passed: true
    tree: 46c668969c178af2fdd4ac9bf7771d9f4806ca322c4e523220b3054036cbe8f0
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 438 dirs visited, 2363 inodes visited, 1 Extract calls, 64.122251ms elapsed, 64.122448ms wall time
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
Lanjutan warna status v1.7.0: mode target opsional (batas Baik/Perlu perhatian absolut, mis. SLA ≥ 95) per nilai, warna KPI terhadap target, warna di daftar batang ringkas, petunjuk di garis/pai/KPI bahwa warna ada di Batang/Pivot, dan tombol terapkan template ke semua widget dashboard (konsistensi tanpa migrasi).

## Acceptance criteria
- [x] Given nilai berarah dengan target, when ditampilkan, then status memakai batas target (bukan rentang relatif) di pivot, batang, dan KPI
- [x] Given widget garis/pai, when panel dibuka, then ada petunjuk warna status hanya untuk Batang/Pivot
- [x] Given template dipilih, when Terapkan ke semua widget, then semua pivot/batang di dashboard memakai template itu
- [x] Tanpa migrasi DB; unit test lulus

## Risk
Impact: tampilan pivot/batang/Angka + panel pengaturan; spec widget (JSON) mendapat field opsional target/colors; tanpa migrasi.
Security (STRIDE): T — target divalidasi zod di server (angka finite, urutan sesuai arah), warna custom hanya hex #RRGGBB (tanpa CSS bebas); I — tidak ada data baru terekspos.
Rollback: IMAGE_TAG prev-<stamp>; widget berbatas/Angka berwarna tampil tidak valid di v1.7.x (runbook §16).
Validation: unit (status-color, tone-schema, bound, chart-status), e2e status-colors 3/3 + regresi pivot/kpi-fit/widgets/pivot-lanjutan; review 3 putaran (0 blokir terakhir).

## Notes

- 2026-11-06T10:36:37Z AC3 diganti versi tanpa endpoint baru (ponytail): warna sendiri terakhir diingat browser dan diisi otomatis di widget lain; template bawaan sama di semua widget. Endpoint massal ditunda (perlu CAS layout + izin per widget).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — logika warna murni di klien; validasi di server lewat skema widget
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — akses widget tidak berubah (pemilik/editor seperti sebelumnya)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — target/colors divalidasi zod di server; teks status dirender sebagai teks React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — skema spec widget strict + refine target
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T10:58:36Z (165165 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 2b33214, 8124f7c, 850026f, 8c0eaa9, 95b7bc9, 9ab9fd1, b1e545a, b714998, d271413, f68d56b
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-reviewer-subagent: 1 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
