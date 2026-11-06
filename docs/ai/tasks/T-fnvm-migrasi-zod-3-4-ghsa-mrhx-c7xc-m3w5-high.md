---
id: T-fnvm
title: Migrasi zod 3 → 4 (GHSA-mrhx-c7xc-m3w5, high)
status: in_progress
profile: standard
created: "2026-10-24T00:31:02Z"
updated: "2026-11-06T09:52:41Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 2b332144e9b115ace8b62b0fc7ef57bf9945d8c3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 161434
    summary: |-
      …files instead of one per file


      > data-dashboard@1.7.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      # npm audit report

      minimatch  7.0.0 - 11.0.0
      Severity: moderate
      minimatch has potential denial of service via globparts amplification - https://github.com/advisories/GHSA-g3hv-75wg-m249
      fix available via `npm audit fix --force`
      Will install typescript-eslint@8.36.0, which is a breaking change
      node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch
        @typescript-eslint/typescript-estree  >=6.16.0
        Depends on vulnerable versions of minimatch
        node_modules/@typescript-eslint/typescript-estree
          @typescript-eslint/parser  >=6.16.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          node_modules/@typescript-eslint/parser
            @typescript-eslint/eslint-plugin  >=6.16.0
            Depends on vulnerable versions of @typescript-eslint/parser
            Depends on vulnerable versions of @typescript-eslint/type-utils
            Depends on vulnerable versions of @typescript-eslint/utils
            node_modules/@typescript-eslint/eslint-plugin
              typescript-eslint  *
              Depends on vulnerable versions of @typescript-eslint/eslint-plugin
              Depends on vulnerable versions of @typescript-eslint/parser
              Depends on vulnerable versions of @typescript-eslint/typescript-estree
              Depends on vulnerable versions of @typescript-eslint/utils
              node_modules/typescript-eslint
          @typescript-eslint/type-utils  >=6.16.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          Depends on vulnerable versions of @typescript-eslint/utils
          node_modules/@typescript-eslint/type-utils
          @typescript-eslint/utils  >=6.16.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          node_modules/@typescript-eslint/utils

      7 moderate severity vulnerabilities

      To address all issues (including breaking changes), run:
        npm audit fix --force
    at: "2026-11-06T09:43:14Z"
    tree: b258146ac9d4b1877103a5677c097c8c6a046ebf431cec2054978fd40c1cf823
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
