---
id: T-k2ec
title: Editor dashboard boleh mengatur kolom filter dari bilah filter
status: done
profile: strict
tags:
  - ui
  - security
created: "2026-10-22T03:19:58Z"
updated: "2026-10-22T11:01:31Z"
closed: "2026-10-22T11:01:31Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 68fde9f7659a6526e4e6ad1512dde1195d7f0d25
paths:
  - content/panduan/06-susun-dashboard.md
  - content/panduan/08-editor-ubah-dashboard.md
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/filter-columns-settings.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/features/dashboards/filter-columns.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - tests/e2e/sharing.spec.ts
  - tests/features/dashboards/filter-columns.test.ts
  - tests/features/dashboards/roles.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T10:45:54Z"
      findings: 8
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-22T10:46:47Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 211852
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792666160297,"service":"data-dashboard","host":"127.0.0.1","port":37475,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792666176171,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792666176195,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792666176198,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792666176208,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792666196197,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792666196218,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  224 passed | 3 skipped (227)
            Tests  3034 passed | 29 skipped (3063)
         Start at  10:47:56
         Duration  145.15s (tests 82%, import 14%, transform 3%)

          Isolate  227 workers spawned · ~120ms startup each (spawn + environment, per file)
                   at least ~8.96s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T10:50:22Z"
    tree: f2bfdef3248d28a3678b313914a90fc3358d24cdc1f301c8ed2160caf1c6ed7a
  commits:
    - 14b219f
    - 3b83c4e
    - 3d38afd
    - 43e0d50
    - 4af631d
    - 5133eac
    - 68fde9f
    - "7266741"
    - 829d5ba
    - 925c090
    - 95344b2
    - 9b36c7d
    - ad5caec
    - ca19b21
    - cb1f89f
    - e69d344
    - f09d71f
    - f5805f9
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-10-22T10:50:23Z"
    passed: true
    tree: f2bfdef3248d28a3678b313914a90fc3358d24cdc1f301c8ed2160caf1c6ed7a
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 315 dirs visited, 1960 inodes visited, 1 Extract calls, 66.726658ms elapsed, 66.726925ms wall time
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
Editor dashboard (bukan hanya pemilik) bisa menambah/menghapus kolom filter langsung dari bilah filter mode edit lewat tombol "Atur kolom filter" (keputusan pemilik 2026-10-22). Viewer tetap ditolak; kolom tersimpan yang sedang tersembunyi/hilang dipertahankan saat editor menyimpan dan namanya tidak pernah dikirim ke editor.

## Acceptance criteria
- [x] Pemilik dan editor dashboard bisa menambah/menghapus kolom filter langsung di bilah filter mode edit tanpa gulir ke kartu pengaturan; viewer tetap tidak bisa (404/403 sesuai konvensi)
- [x] Viewer tetap hanya mengirim {widgetId, dashboardFilters} untuk kolom filter yang terdaftar
- [x] Panduan 08 editor diperbarui (keputusan pemilik 2026-10-22: editor boleh menambah filter)

## Risk
Impact: PATCH /api/dashboards/[id]/filter-columns kini menerima editor; UI bilah filter mode edit. Security (STRIDE): Elevation — canEditWhere di baca dan tulis, viewer 403 / tanpa akses 404 (unit roles.test + e2e sharing); Information disclosure — respons editor disaring ke kolom tersedia, galat tidak menyebut nama kolom tersembunyi; Tampering — kolom diverifikasi terhadap skema versi aktif (checkFilterColumns). Lost update antar pengguna → T-4q8n. Rollback: revert commit 5133eac + ca19b21 (tanpa migrasi). Validation: aitk check, e2e sharing 39/39, review 2 putaran (0 blokir).

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
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa komunikasi eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file/upload
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa perubahan konfigurasi/dependensi

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-22T10:50:22Z (211852 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 14b219f, 3b83c4e, 3d38afd, 43e0d50, 4af631d, 5133eac, 68fde9f, 7266741, 829d5ba, 925c090, 95344b2, 9b36c7d, ad5caec, ca19b21, cb1f89f, e69d344, f09d71f, f5805f9
- Review pass 1 by claude-reviewer-subagent: 8 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
