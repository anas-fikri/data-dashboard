---
id: T-fnvm
title: Migrasi zod 3 → 4 (GHSA-mrhx-c7xc-m3w5, high)
status: in_review
profile: strict
created: "2026-10-24T00:31:02Z"
updated: "2026-11-06T09:55:26Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 2b332144e9b115ace8b62b0fc7ef57bf9945d8c3
paths:
  - .github/workflows/ci.yml
  - package-lock.json
  - package.json
  - src/features/query/spec.ts
  - src/features/widgets/spec.ts
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 157647
    summary: |-
      …tolak NAS"}
      {"level":40,"time":1793958883546,"service":"data-dashboard","host":"127.0.0.1","port":32951,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1793958899868,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1793958899891,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1793958899893,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1793958899905,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1793958909364,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1793958909382,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  232 passed | 3 skipped (235)
            Tests  3106 passed | 29 skipped (3135)
         Start at  09:53:35
         Duration  109.52s (tests 82%, import 16%, transform 2%)

          Isolate  235 workers spawned · ~94ms startup each (spawn + environment, per file)
                   at least ~7.27s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-06T09:55:25Z"
    tree: 36d4b3d0c52cb691d5dd77c90e25eaade8327e75d18f24d5d57bc1ad039687d7
  commits:
    - 0b900f3
    - 2b33214
    - 3d6b854
    - 3db23b5
    - 4fcedbe
    - 5448b90
    - 7e996ac
    - 88ad754
    - a2d6c0a
    - b1e545a
    - b285387
    - c0fdc24
    - c9d3a79
    - ccd8e58
    - d5d36a3
    - da9dbbf
    - ddfd307
    - def261a
    - eae474e
    - ef427f1
    - f68d56b
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-06T09:49:16Z"
    passed: true
    tree: 36d4b3d0c52cb691d5dd77c90e25eaade8327e75d18f24d5d57bc1ad039687d7
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 376 dirs visited, 2161 inodes visited, 1 Extract calls, 46.245198ms elapsed, 46.245439ms wall time
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
Advisori GHSA-mrhx-c7xc-m3w5 (high, 2026-10-24): zod < 4.6.6 bisa menghabiskan memori saat memvalidasi koleksi berbatas yang sangat besar; semua zod 3.x terdampak, perbaikan hanya di zod 4. Migrasi ±30 file `from "zod"` ke zod ≥ 4.6.7 (pesan galat, `z.record`, `.default`, `error` map, `zod-validation-error` di eslint-plugin-react-hooks hanya dev). Keputusan pemilik 2026-10-24: rilis v1.5.1 (fix gerbang deploy) dulu, zod sesudahnya (v1.5.2). Selama itu `aitk check` merah karena npm audit (prod high); risiko rendah karena body JSON API dibatasi ukurannya sebelum validasi (src/lib/http-body.ts).

## Acceptance criteria
- [x] npm run audit (prod high) hijau dengan zod ≥ 4.6.7
- [x] typecheck + seluruh unit test lulus tanpa ubah perilaku

## Risk
Impact: semua validasi input (spec widget, query, server action) memakai zod; perilaku harus sama. Pesan bawaan zod (bukan pesan khusus aplikasi) bisa berubah teks.
Security (STRIDE): D (denial of service) — menutup GHSA-mrhx-c7xc-m3w5 (memori habis saat validasi koleksi besar); tidak ada perubahan aturan validasi (S/T/E tidak berubah).
Rollback: tanpa migrasi DB; kembalikan image ke prev-<stamp> (runbook §11).
Validation: typecheck + 3.106 unit test lulus; npm run audit prod 0 kerentanan; e2e belum (butuh layanan).

## Notes

- 2026-11-06T09:40:27Z zod 4.6.7: hanya 2 penyesuaian tipe ctx.addIssue (query/spec.ts, widgets/spec.ts). 3.106 unit test lulus. e2e belum dijalankan (butuh layanan); pesan galat bawaan zod untuk kunci asing berubah teks tetapi pesan khusus aplikasi tetap.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tidak berubah; zod tetap di sisi server untuk semua input
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak menyentuh kontrol akses
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — aturan validasi sama (3.106 unit test lulus), hanya versi pustaka
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak menyentuh kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan galat dari skema aplikasi, bukan internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak menyentuh data pribadi
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak menyentuh jaringan
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — zod resmi dari npm, versi dipin di lockfile
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: logika bisnis tidak berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: unggahan tidak berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — skema input API tetap; batas body sebelum validasi tetap
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — dependensi diperbarui: advisori high ditutup, audit prod 0

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-06T09:55:25Z (157647 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 0b900f3, 2b33214, 3d6b854, 3db23b5, 4fcedbe, 5448b90, 7e996ac, 88ad754, a2d6c0a, b1e545a, b285387, c0fdc24, c9d3a79, ccd8e58, d5d36a3, da9dbbf, ddfd307, def261a, eae474e, ef427f1, f68d56b
