---
id: T-tpfh
title: Longgarkan batas uji kinerja render panduan (1000 → 1500 ms CPU)
status: done
profile: strict
tags:
  - test
created: "2026-10-23T14:04:45Z"
updated: "2026-10-23T17:17:10Z"
closed: "2026-10-23T17:17:10Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e78523184b7790fa12557e76af535ed59646f0cb
paths:
  - content/panduan/03-unggah-data.md
  - content/panduan/05-ganti-data-pemetaan.md
  - deploy/images.sh
  - deploy/release.sh
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - prisma/migrations/20261023150000_t85tb_selected_sheets/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/api/uploads/route.ts
  - src/components/admin/users-status-filter.tsx
  - src/components/dashboards/add-filter-column-menu.tsx
  - src/components/datasets/upload-panel-state.ts
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/upload-sheet-picker.tsx
  - src/components/grid/grid-period-picker.tsx
  - src/components/grid/sheet-grid.tsx
  - src/components/mapping/mapping-picker.tsx
  - src/components/shell/app-shell.tsx
  - src/components/ui/menu-search.tsx
  - src/components/ui/select.tsx
  - src/features/ingest/ingest.ts
  - src/features/ingest/repo.ts
  - src/features/ingest/xlsx-parallel.ts
  - src/features/uploads/client.ts
  - src/features/uploads/service.ts
  - src/features/uploads/sheet-selection.ts
  - src/features/uploads/xlsx-sheets.ts
  - src/lib/xlsx/parser.ts
  - src/lib/xlsx/types.ts
  - tests/e2e/filters.spec.ts
  - tests/e2e/helpers.ts
  - tests/e2e/ingest.spec.ts
  - tests/e2e/sharing.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/features/guides/markdown.test.ts
  - tests/features/ingest/fakes.ts
  - tests/features/ingest/parallel.test.ts
  - tests/features/uploads/service.test.ts
  - tests/features/uploads/xlsx-sheets.test.ts
  - tests/scripts/parser-sax-edge.test.ts
  - tests/scripts/release.test.ts
  - tests/scripts/upgrade-gates.test.ts
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-23T17:17:08Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T17:17:09Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 253953
    summary: |-
      …t":"127.0.0.1","port":43465,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792775457625,"service":"data-dashboard","host":"127.0.0.1","port":44603,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792775457728,"service":"data-dashboard","host":"127.0.0.1","port":43301,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792775457853,"service":"data-dashboard","host":"127.0.0.1","port":37317,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792775459439,"service":"data-dashboard","datasetId":"t072mvl87wt6ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792775469896,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792775488224,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792775488247,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792775488250,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792775488265,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  230 passed | 1 skipped (231)
            Tests  3104 passed | 10 skipped (3114)
         Start at  17:09:03
         Duration  167.54s (tests 82%, import 14%, transform 3%)

          Isolate  231 workers spawned · ~151ms startup each (spawn + environment, per file)
                   at least ~11.46s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.4.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-23T17:11:52Z"
    tree: ce001c923770b8f3645add0c255dc807a460f8741395de168167267c0fe34eba
  commits:
    - 07c429f
    - 12c9032
    - 13d2307
    - 1c79106
    - 28a8b1a
    - 39adbb7
    - 3ba900a
    - 4a32c9e
    - 4a9c1bc
    - 4fbb304
    - 9c9b2f2
    - c2d9cee
    - c917a8e
    - dd070f5
    - e099ea2
    - e1414ab
    - f3beaef
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-23T17:11:57Z"
    passed: true
    tree: ce001c923770b8f3645add0c255dc807a460f8741395de168167267c0fe34eba
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 514 dirs visited, 2854 inodes visited, 1 Extract calls, 86.979296ms elapsed, 86.979676ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.4.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Uji kinerja render panduan (CPU < 1000 ms) gagal 2× di VM sibuk (1077 ms) tanpa perubahan kode terkait; pemilik memilih melonggarkan batas. Dipilih 1300 ms agar regresi kuadratik terkecil (1,4 s) tetap tertangkap.

## Acceptance criteria
- [x] RENDER_MAX_MS di tests/features/guides/markdown.test.ts dilonggarkan (1300, bukan 1500: regresi terkecil yang dicari 1,4 s) dengan alasan beban mesin; aitk check lulus di VM sibuk (keputusan pemilik 2026-10-23)

## Risk
Impact: hanya batas waktu satu uji unit. Security (STRIDE): tidak ada perubahan kode produksi; uji DoS tetap menangkap regresi ≥ 1,4 s. Rollback: revert commit. Validation: aitk check lulus.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya mengubah batas waktu uji unit, tanpa kode produksi

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-23T17:11:52Z (253953 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 07c429f, 12c9032, 13d2307, 1c79106, 28a8b1a, 39adbb7, 3ba900a, 4a32c9e, 4a9c1bc, 4fbb304, 9c9b2f2, c2d9cee, c917a8e, dd070f5, e099ea2, e1414ab, f3beaef
- Review pass 1 by claude-code: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
