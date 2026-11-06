---
id: T-7czr
title: 'Gerbang T-gcn8 salah alarm: headerRow typed NULL = baris judul segmen'
status: in_review
profile: standard
created: "2026-10-24T00:07:24Z"
updated: "2026-10-24T00:22:59Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: aff74e4330f25c32d82a1fcfa7a37db7db3d9ac6
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-24T00:19:23Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-24T00:19:24Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 212741
    summary: |-
      …level":40,"time":1792801348401,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792801348407,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792801348420,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  230 passed | 1 skipped (231)
            Tests  3104 passed | 10 skipped (3114)
         Start at  00:20:35
         Duration  142.26s (tests 83%, import 14%, transform 3%)

          Isolate  231 workers spawned · ~120ms startup each (spawn + environment, per file)
                   at least ~9.08s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.5.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      # npm audit report

      nodemailer  3.0.0 - 10.1.3
      Severity: moderate
      Nodemailer: A nested comment ends early in addressparser, releasing the rest of the comment as a recipient - https://github.com/advisories/GHSA-8c8m-p3m8-cjg8
      Nodemailer: A ";" inside a quoted string or comment ends an address group early in addressparser, turning display text into a recipient - https://github.com/advisories/GHSA-m943-m63m-w62w
      Nodemailer: A ">" inside a quoted local part ends an angle-addr early in addressparser, delivering to a domain the header does not name - https://github.com/advisories/GHSA-85x2-q946-cp5h
      fix available via `npm audit fix`
      node_modules/nodemailer

      zod  <4.6.6
      Severity: high
      Zod can exhaust memory while validating oversized constrained collections - https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
      fix available via `npm audit fix --force`
      Will install zod@4.6.7, which is a breaking change
      node_modules/zod

      2 vulnerabilities (1 moderate, 1 high)

      To address issues that do not require attention, run:
        npm audit fix

      To address all issues (including breaking changes), run:
        npm audit fix --force
    at: "2026-10-24T00:22:58Z"
    tree: d5029c5fc3b9478e0376ae7b02a7a4621f4f4959b49d7591bfd36191d30c1d91
  check_failures: 1
---

## Objective
Deploy v1.5.0 (2026-10-23 23:22Z) berhenti di gerbang pasca-migrasi T-gcn8 karena 3 file typed ber-`headerRow` NULL (dibuat ingest pertama v1.4.1) dihitung tidak cocok, padahal NULL berarti baris judul segmen (= sheet). Produksi di-rollback ke v1.4.1 tanpa kehilangan data. Perbaiki gerbang agar membandingkan nilai efektif (COALESCE dengan Segment.headerRow) dan ingest pertama mencatat headerRow eksplisit.

## Acceptance criteria
- [x] Gerbang T-gcn8 di upgrade.sh memakai COALESCE(SegmentTyped.headerRow, Segment.headerRow): baris NULL yang benar lolos, ketidakcocokan sungguhan tetap tertangkap (diuji di DB dev pada data ingest nyata)
- [x] Ingest pertama mencatat SegmentTyped.headerRow (uji tests/features/ingest/ingest.test.ts)

## Risk
Impact: satu kueri gerbang di deploy/upgrade.sh + satu isian yang ditulis ingest pertama (nilai sama dengan Segment.headerRow; pembaca data sudah memakai `t.headerRow ?? segment.headerRow`, jadi perilaku baca tidak berubah). Data produksi tidak diubah.
Security (STRIDE): tanpa permukaan baru; gerbang tetap fail-closed (kueri error → gagal).
Rollback: revert commit; data yang sudah ditulis bernilai sama dengan segmen.
Validation: kueri lama vs baru di DB dev dalam transaksi yang dibatalkan (NULL: lama 1/baru 0; ketidakcocokan 999: baru 1), uji unit ingest, e2e ingest.

## Notes
