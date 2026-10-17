---
id: T-t1g0
title: 'Ingest: kolom dibaca id-ID padahal ada ribuan koma gaya US (''1,500'') ditandai ambigu seperti T-030'
status: in_review
profile: standard
depends_on:
  - T-030
created: "2026-10-16T17:28:57Z"
updated: "2026-10-17T07:02:10Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: a54a31aa3e8ceb28960c836d56dc7397108216ad
review:
  passes:
    - "n": 1
      by: claude-agent-review
      at: "2026-10-17T07:00:44Z"
      findings: 0
    - "n": 2
      by: claude-confirm-review
      at: "2026-10-17T07:00:45Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 78853
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792220483650,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792220483676,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792220483679,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792220483688,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  127 passed (127)
            Tests  1739 passed (1739)
         Start at  14:01:09
         Duration  52.66s (tests 73%, import 20%, transform 6%)

          Isolate  127 workers spawned · ~254ms startup each (spawn + environment, per file)
                   at least ~3.33s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T07:02:04Z"
    tree: 24f52e7fdf167380a87d03cda934e077b46dfee599a4aebd927f236c090ff8f3
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given CSV yang dibaca locale id-ID tetapi berisi nilai ribuan koma gaya US seperti '1,500' atau '12,345', when di-ingest, then kolom ditandai penulisan angka ambigu di halaman skema (atau dibaca US bila buktinya mayoritas)
- [x] Given kolom id-ID bersih tanpa nilai ribuan koma, when di-ingest, then tidak ditandai

## Risk
Impact: deteksi locale angka saat ingest (profil + seri bukti lemah CSV) dan pesan penanda di editor skema. Kolom CSV yang buktinya seri dengan "1,500" lebih banyak dari "1.234" kini dibaca US (sebelumnya id-ID); keduanya tetap ditandai. Versi yang sudah READY tidak berubah sampai di-ingest/recast ulang.
Security (STRIDE): tidak ada permukaan baru (hitungan regex di subquery profil yang sama; tanpa input pengguna baru).
Rollback: revert commit; skema tersimpan hanya memakai field localeAmbiguous yang sudah ada.
Validation: tes integrasi ingest (desimal '1,500', bulat '1,000', seri mayoritas), unit decide, render baris kolom; regex diuji di DuckDB untuk 0,500 / -1,500 / (1,500) / 1,500.25 / 12,345,678 (reviewer); aitk check 1739 tes.

## Notes

- 2026-10-17T07:02:10Z AC1: profil menghitung usWeak ('1,500' satu grup koma 3 digit); kolom id-ID dengan usWeak > 0 ditandai localeAmbiguous (pesan: '“1,500” dibaca 1,5. Pilih internasional bila maksudnya ribuan.'); seri bukti lemah CSV kini ke mayoritas (idWeak > usWeak → id, selain itu US) — tes typed.test.ts T-t1g0 (desimal, bulat '1,000', seri mayoritas) + schema-locale-ambiguous.test.ts. AC2: kolom id-ID bersih (ribuan titik, desimal koma 1-2 digit) tidak ditandai (tes yang sama). Kasus berat 3 desimal id-ID '1,250' yang terbaca US → task lanjutan T-baj2.
