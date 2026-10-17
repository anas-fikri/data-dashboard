---
id: T-2nkx
title: Lencana kategori ringkas 'N/M' untuk kartu grafik pendek yang sempit (pita di bawah ambang T-032)
status: in_review
profile: standard
depends_on:
  - T-032
created: "2026-10-16T19:52:25Z"
updated: "2026-10-17T07:39:24Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 57706187818d5ba87fd5a394b633084c1d1bbed8
review:
  passes:
    - "n": 1
      by: frontend-design-reviewer
      at: "2026-10-17T07:38:12Z"
      findings: 1
    - "n": 2
      by: frontend-design-reviewer-confirm
      at: "2026-10-17T07:38:12Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 70845
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

      {"level":40,"time":1792222725902,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792222725926,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792222725928,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792222725933,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  127 passed (127)
            Tests  1742 passed (1742)
         Start at  14:38:34
         Duration  48.46s (tests 75%, import 19%, transform 6%)

          Isolate  127 workers spawned · ~202ms startup each (spawn + environment, per file)
                   at least ~2.64s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T07:39:24Z"
    tree: a59421dd9831321a281e11d024ba38c97b86d5d4c48dd3a5cd837700f37f1df0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given kartu batang/garis setinggi 2 baris dengan kategori terpotong dan lebar di bawah ambang lencana 'N dari M' (lihat < 15,5rem, edit < 20rem), when dilihat, then ada penanda jumlah kategori yang tampil dari total tanpa membuat judul kartu kurang dari 4rem

## Risk
Impact: kepala kartu grafik (batang/garis) di dashboard: lencana ringkas "N/M" pada pita lebar tepat di bawah ambang lencana T-032 (lihat 14–15,5rem, edit 18,5–20rem), hanya untuk pointer halus di ≥ md (tombol kepala 32 px). Tampilan lain tidak berubah.
Security (STRIDE): tidak relevan (tampilan saja, tanpa data atau endpoint baru).
Rollback: revert commit; tidak ada data/migrasi.
Validation: unit chartFit.badgeCompact; e2e chart-polish (sapuan 1024–1600 px lihat/edit: lencana ringkas tampil di kedua mode, tidak pernah ganda dengan lencana penuh, judul ≥ 64 px; konteks sentuh: tanpa lencana ringkas); review desain 2 putaran (1 HIGH pointer sentuh → 0); CSS terkompilasi diperiksa reviewer. Sisa (task T-7ke3): lencana penuh T-032 di pointer sentuh dan angka panjang.

## Notes

- 2026-10-17T07:38:13Z AC1: lencana ringkas 'N/M' (data-testid chart-badge-compact) tampil pada pita lihat 14–15,5rem / edit 18,5–20rem di pointer halus ≥ md; e2e chart-polish menyapu 1024–1600 px dan memastikan lencana ringkas muncul di kedua mode, tidak ganda dengan lencana penuh, judul ≥ 64 px; konteks sentuh tanpa lencana ringkas. Bukti visual test-results/t-2nkx-ringkas-{lihat,edit}.png.
