---
id: T-vb7q
title: Filter bawaan per kolom filter dashboard
status: done
profile: strict
tags:
  - ui
  - security
created: "2026-10-22T03:20:00Z"
updated: "2026-10-22T11:31:58Z"
closed: "2026-10-22T11:31:58Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 625cf78cea1d5ee89632a4a96f2be84db34fd163
paths:
  - content/panduan/06-susun-dashboard.md
  - content/panduan/08-editor-ubah-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/filter-columns-settings.tsx
  - src/components/dashboards/filters/default-filters.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/components/dashboards/filters/filter-chips.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/features/dashboards/filter-columns.ts
  - tests/components/default-filters.test.ts
  - tests/e2e/filters.spec.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T11:20:08Z"
      findings: 6
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-22T11:22:46Z"
      findings: 2
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-22T11:31:49Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 222220
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792668378633,"service":"data-dashboard","host":"127.0.0.1","port":43271,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792668402441,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792668402465,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792668402471,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792668402486,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792668409112,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792668409130,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  225 passed | 3 skipped (228)
            Tests  3050 passed | 29 skipped (3079)
         Start at  11:24:50
         Duration  150.04s (tests 82%, import 14%, transform 4%)

          Isolate  228 workers spawned · ~127ms startup each (spawn + environment, per file)
                   at least ~9.50s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T11:27:21Z"
    tree: cdaf90fb6e58f27886f82c0f882c35e0aa356792db6915037f737d0948ef8761
  commits:
    - 14b219f
    - 19b430b
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
    - e69d344
    - f09d71f
    - f5805f9
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-10-22T11:27:22Z"
    passed: true
    tree: cdaf90fb6e58f27886f82c0f882c35e0aa356792db6915037f737d0948ef8761
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 375 dirs visited, 2100 inodes visited, 1 Extract calls, 61.425822ms elapsed, 61.426086ms wall time
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
Pemilik/editor menyimpan filter yang sedang aktif sebagai filter bawaan per kolom filter (Dashboard.filterColumns[].default, tanpa migrasi). Dashboard yang dibuka tanpa ?f= langsung memakai bawaan (chip berlabel "bawaan"); "Hapus semua filter" menulis f={} sehingga muat ulang tetap tanpa filter; "Kembalikan filter bawaan" memulihkan. Widget, ekspor, dan PDF tetap memakai status aktif yang dikirim sebagai dashboardFilters — server query tidak mengenal bawaan.

## Acceptance criteria
- [x] Pemilik/editor bisa memasang nilai bawaan per kolom filter (tanggal: preset mis. Bulan ini; kategori: nilai terpilih)
- [x] Viewer yang membuka tanpa ?f melihat filter bawaan aktif dengan label bawaan; Hapus semua filter menampilkan seluruh data; body permintaan tetap {widgetId, dashboardFilters}
- [x] Ekspor dan PDF memakai filter aktif yang sama

## Risk
Impact: bentuk JSON Dashboard.filterColumns bertambah field opsional `default`; status filter klien (URL ?f=). Security (STRIDE): Tampering — default divalidasi zod (dashFilterSchema strict) + defaultFits + ≤ 100 nilai, body ≤ 64 KB; Information disclosure — non-pemilik tetap tidak menerima kolom tidak tersedia beserta bawaannya; Elevation — tulis lewat jalur kolom filter (canEditWhere, viewer 403). Rollback: revert commit (field opsional diabaikan kode lama: storedFilterColumns strict lama membuang entri ber-default → kolom filter berbawaan hilang di versi lama; hapus bawaan dulu sebelum rollback). Validation: aitk check, unit default-filters, e2e filters 7/7, review subagen.

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
- Check: `npm run check` → exit 0 at 2026-10-22T11:27:21Z (222220 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 14b219f, 19b430b, 3b83c4e, 3d38afd, 43e0d50, 4af631d, 5133eac, 625cf78, 68fde9f, 7266741, 7deab10, 829d5ba, 8e808c9, 925c090, 95344b2, 9b36c7d, ad5caec, ca19b21, cb1f89f, e69d344, f09d71f, f5805f9
- Review pass 1 by claude-reviewer-subagent: 6 findings
- Review pass 2 by claude-reviewer-subagent: 2 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
