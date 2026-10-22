---
id: T-zm9k
title: Dashboard awal otomatis dari skema dataset
status: done
profile: strict
tags:
  - ui
created: "2026-10-22T03:20:01Z"
updated: "2026-10-22T12:45:07Z"
closed: "2026-10-22T12:45:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 09e9b98154342f3d671ecec0ffead272d341a1a4
paths:
  - content/panduan/06-susun-dashboard.md
  - content/panduan/08-editor-ubah-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - content/panduan/13-widget-pivot.md
  - docs/catatan-kerja-claude.md
  - docs/runbook-deploy.md
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/api/query/route.ts
  - src/components/dashboards/auto-title.ts
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-form.tsx
  - src/components/dashboards/filter-columns-settings.tsx
  - src/components/dashboards/filters/default-filters.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/components/dashboards/filters/filter-chips.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/components/dashboards/pivot-config-model.ts
  - src/components/dashboards/smart-defaults.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-panel.tsx
  - src/components/saved-pivots/saved-pivot-editor.tsx
  - src/components/saved-pivots/saved-pivot-preview.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/actions.ts
  - src/features/dashboards/filter-columns.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/dashboards/starter.ts
  - src/features/dashboards/validation.ts
  - src/features/query/http.ts
  - src/features/query/service.ts
  - src/features/query/widget.ts
  - tests/components/default-filters.test.ts
  - tests/components/pivot-ui.test.ts
  - tests/components/smart-defaults.test.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/filters.spec.ts
  - tests/e2e/pivot.spec.ts
  - tests/e2e/saved-pivot-widgets.spec.ts
  - tests/e2e/sharing.spec.ts
  - tests/e2e/widgets.spec.ts
  - tests/features/dashboards/dashboards.test.ts
  - tests/features/dashboards/filter-columns.test.ts
  - tests/features/dashboards/roles.test.ts
  - tests/features/dashboards/starter.test.ts
  - tests/features/query/bound-widgets.test.ts
  - tests/features/query/query-http.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T11:39:35Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-22T11:42:01Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-22T11:43:00Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 217130
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792672785445,"service":"data-dashboard","host":"127.0.0.1","port":42301,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792672805396,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792672805419,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792672805423,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792672805438,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792672823635,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792672823654,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  226 passed | 3 skipped (229)
            Tests  3055 passed | 29 skipped (3084)
         Start at  12:38:14
         Duration  147.91s (tests 82%, import 14%, transform 3%)

          Isolate  229 workers spawned · ~124ms startup each (spawn + environment, per file)
                   at least ~9.37s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T12:40:43Z"
    tree: 4895bb70bd08ddec4f8afdc4970e79d90f3badbd8c32b318f1ff89001b01c317
  commits:
    - 09e9b98
    - 0de3280
    - 14b219f
    - 1782e3e
    - 19b430b
    - 33058d5
    - 3b83c4e
    - 3d38afd
    - 43e0d50
    - 4af631d
    - 5133eac
    - 625cf78
    - 68fde9f
    - "7266741"
    - 7deab10
    - 829d5ba
    - 8e808c9
    - 925c090
    - 95344b2
    - 9b36c7d
    - ad5caec
    - ca19b21
    - cb1f89f
    - de9b9f2
    - e69d344
    - e78906d
    - f09d71f
    - f5805f9
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-10-22T12:40:44Z"
    passed: true
    tree: 4895bb70bd08ddec4f8afdc4970e79d90f3badbd8c32b318f1ff89001b01c317
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 417 dirs visited, 2233 inodes visited, 1 Extract calls, 50.285362ms elapsed, 50.285546ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.3.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Kotak centang "Mulai dengan dashboard contoh" di form buat dashboard menyusun widget awal di server dari skema versi aktif: KPI total besaran + jumlah baris, garis per tanggal, batang per kategori (2–50 nilai), tabel data, serta kolom filter tanggal + kategori — memakai isian bawaan pintar T-12zs dan judul otomatis, divalidasi checkConfig/checkFilterColumns, ditulis dalam transaksi pembuatan dashboard. Dataset tanpa angka/tanggal mendapat KPI jumlah baris + tabel; tanpa data siap → dashboard kosong.

## Acceptance criteria
- [x] Buat dashboard dengan pilihan Mulai dengan dashboard contoh pada dataset bertanggal+angka+kategori menghasilkan >= 4 widget berisi data dan >= 2 kolom filter tanpa langkah tambahan
- [x] Dataset tanpa kolom angka/tanggal tetap berhasil (KPI jumlah baris + tabel)
- [x] Panduan susun dashboard diperbarui

## Risk
Impact: createDashboard (pemilik saja) menulis widget + layout + filterColumns saat dicentang; tanpa centang perilaku lama. Security (STRIDE): skema dibaca hanya untuk dataset milik user (getDatasetSources/findFirst ownerId), sheet divalidasi terhadap versi aktif dataset itu. Race aktivasi versi: versi dibaca sebelum skema + FOR SHARE di transaksi (review pass 2–3). Rollback: revert commit; dashboard contoh yang sudah dibuat tetap dashboard biasa. Validation: unit starter.test, e2e filters T-zm9k, review 3 putaran (5 → 1 → 0).

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
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru (hanya skema dataset milik user)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa komunikasi eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file/upload
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: Server Action yang ada, tanpa API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa perubahan konfigurasi/dependensi

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-22T12:40:43Z (217130 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 09e9b98, 0de3280, 14b219f, 1782e3e, 19b430b, 33058d5, 3b83c4e, 3d38afd, 43e0d50, 4af631d, 5133eac, 625cf78, 68fde9f, 7266741, 7deab10, 829d5ba, 8e808c9, 925c090, 95344b2, 9b36c7d, ad5caec, ca19b21, cb1f89f, de9b9f2, e69d344, e78906d, f09d71f, f5805f9
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-reviewer-subagent: 1 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
