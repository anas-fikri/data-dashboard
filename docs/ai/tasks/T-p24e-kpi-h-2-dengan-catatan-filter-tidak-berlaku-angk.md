---
id: T-p24e
title: 'KPI h=2 dengan catatan filter tidak berlaku: angka terpotong setengah di kartu lebar'
status: in_progress
profile: standard
goal: G-4
tags:
  - bug
created: "2026-10-16T01:58:55Z"
updated: "2026-10-16T15:25:49Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 48745498b682e380c4840bebacfbd9b0f2720e9f
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 38647
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

      {"level":40,"time":1792164330818,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792164330840,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792164330848,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1681 passed (1681)
         Start at  22:25:23
         Duration  24.57s (tests 74%, import 19%, transform 6%, worker 1%)

          Isolate  117 workers spawned · ~134ms startup each (spawn + environment, per file)
                   at least ~1.60s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T15:25:49Z"
    tree: 319f8d4ef18269b9e4a6a5ee2c752859c8066007b507385987fe4a78b31a2664
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given kartu KPI tinggi 2 baris grid lebar 3–12 kolom dengan catatan 'filter tidak berlaku' atau kolom kosong, when dashboard dibuka di 1024/1440/1920 px dan diekspor PDF, then angka KPI tampil utuh di dalam kartu (tidak terpotong)
- [ ] Given kartu KPI tanpa catatan, when dibuka di ukuran yang sama, then ukuran angka tidak mengecil dibanding sebelumnya

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-16T01:59:03Z Ditemukan review T-018 r3 (integrity): layar 1440/1920 px, kartu KPI h=2 lebar ≥ 3 kolom + baris catatan h-6 'N filter tidak berlaku' → angka KPI (ukuran font container query besar) terpotong setengah; kartu sempit/tanpa catatan aman. PDF ikut terpotong bila judul 2 baris. Sumber: src/components/widgets/kpi-view.tsx (ukuran angka hanya dari lebar container, tidak memperhitungkan tinggi sisa). Arah perbaikan: batasi ukuran angka juga oleh tinggi (cqh / min(cqw,cqh)) atau ukur sisa tinggi.
- 2026-10-16T02:17:53Z Perbaikan akar masuk di commit 978656b (fix review T-018 r3): kpiHeightPx + chooseKpi(maxPx) — ukuran angka dibatasi tinggi kotak (layar + cetak). Terukur 1440 px filter Cabang: 5 KPI h=2 bercatatan utuh di 20 px (sebelum: 36 px terpotong 13,4 px); KPI tanpa catatan tetap 36 px. Sisa untuk task ini: tes regresi layar (e2e 1024/1440/1920) lalu close.
