---
id: T-rb6x
title: 'PDF: widget QUERY_BUSY saat cache parquet dingin menunggu unduhan pertama lebih lama (bukan kartu galat)'
status: in_review
profile: standard
depends_on:
  - T-018
created: "2026-10-16T15:09:42Z"
updated: "2026-10-17T07:18:51Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 828d007129fb72724102961c38cab9d35763ef80
review:
  passes:
    - "n": 1
      by: claude-agent-review
      at: "2026-10-17T07:17:36Z"
      findings: 2
    - "n": 2
      by: claude-confirm-review
      at: "2026-10-17T07:17:36Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 60376
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

      {"level":40,"time":1792221501347,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792221501372,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792221501375,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792221501381,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  127 passed (127)
            Tests  1741 passed (1741)
         Start at  14:18:11
         Duration  39.08s (tests 74%, import 19%, transform 6%)

          Isolate  127 workers spawned · ~160ms startup each (spawn + environment, per file)
                   at least ~2.10s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T07:18:51Z"
    tree: 63762b4da43e7df912c4648bcbadd1272cac007204c00c2cc2720201170cb8c3
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given cache parquet dingin dan unduhan sheet pertama > 1,2 detik, when dashboard dua sheet diekspor PDF, then semua widget tercetak berisi data (tidak ada kartu 'Kode: QUERY_BUSY') selama unduhan selesai dalam batas tunggu unduhan
- [x] Given unduhan tidak selesai dalam batas tunggu, when ekspor PDF, then PDF tetap jadi dalam batas waktu render dengan kartu galat widget itu (tidak menggantung)

## Risk
Impact: pemuatan data halaman /render (ekspor PDF): QUERY_BUSY dicoba ulang dalam batas tunggu bersama 15 dtk per render, dan tiap percobaan menunggu unduhan parquet paling lama sisa batas itu (prepareWaitMs). /api/query di layar tidak berubah.
Security (STRIDE): D — batas bersama mencegah render menahan slot query user tanpa batas (sebelumnya 10 dtk per widget yang antre bisa menumpuk melewati batas renderer); tidak ada permukaan baru.
Rollback: revert commit (kontrak deps.query internal, tanpa migrasi/konfigurasi).
Validation: tes render-session dengan timer palsu + cache parquet tiruan (AC1 dua sheet 5 dtk + 3 dtk → semua widget berisi data; AC2 10 widget unduhan macet → semua QUERY_BUSY, selesai ≤ 15 dtk), uji mutasi (batas per percobaan dicabut → AC2 gagal), review 2 putaran (2 → 0). Sisa: antrean engine (≤ 10 dtk) saat slot user dipakai layar, QUERY_TIMEOUT query lambat (bawaan).

## Notes

- 2026-10-17T07:17:49Z AC1: QUERY_BUSY render PDF dicoba ulang dalam batas bersama 15 dtk (BUSY_WAIT_MS), percobaan ikut menunggu unduhan ≤ sisa batas — tes render-session 'cache dingin dua sheet' (unduhan 5 dtk + 3 dtk, semua widget berisi data). AC2: unduhan macet → kartu QUERY_BUSY, pemuatan data ≤ 15 dtk (di bawah RENDER_READY_TIMEOUT_MS 30 dtk renderer) — tes 10 widget + uji mutasi.
