---
id: T-p24e
title: 'KPI h=2 dengan catatan filter tidak berlaku: angka terpotong setengah di kartu lebar'
status: in_review
profile: standard
goal: G-4
tags:
  - bug
created: "2026-10-16T01:58:55Z"
updated: "2026-10-16T15:41:48Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 48745498b682e380c4840bebacfbd9b0f2720e9f
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-16T15:41:00Z"
      findings: 0
    - "n": 2
      by: frontend-expert-test-engineer
      at: "2026-10-16T15:41:00Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 40325
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

      {"level":40,"time":1792165288054,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792165288080,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792165288089,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1681 passed (1681)
         Start at  22:41:20
         Duration  26.19s (tests 75%, import 18%, transform 6%, worker 1%)

          Isolate  117 workers spawned · ~136ms startup each (spawn + environment, per file)
                   at least ~1.63s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T15:41:48Z"
    tree: 6849abc6abc7fac2f3b4e6c918ed9a3d8d54afe5a4edefb4e7895010fe43a89c
---

## Objective
Angka KPI di kartu pendek (tinggi 2 baris grid) yang memuat catatan 'N filter tidak berlaku' tampil utuh di layar 1024/1440/1920 px dan di PDF, tanpa mengecilkan KPI yang tidak bercatatan. Perbaikan akar sudah masuk lewat T-018 (978656b); task ini mengunci perilakunya dengan tes regresi e2e.

## Acceptance criteria
- [x] Given kartu KPI tinggi 2 baris grid lebar 3–12 kolom dengan catatan 'filter tidak berlaku' atau kolom kosong, when dashboard dibuka di 1024/1440/1920 px dan diekspor PDF, then angka KPI tampil utuh di dalam kartu (tidak terpotong)
- [x] Given kartu KPI tanpa catatan, when dibuka di ukuran yang sama, then ukuran angka tidak mengecil dibanding sebelumnya

## Risk
Impact: hanya tes + urutan project Playwright (kpi-fit setelah pdf, sebelum rate-limit); kode aplikasi tidak berubah. Security (STRIDE): tidak ada permukaan baru (tes memakai skrip dev-render-token yang menolak produksi). Rollback: revert commit tes. Validation: tes gagal bila batas tinggi KPI dimatikan (1024 px KPI bercatatan w4 terpotong, huruf 30 px), lulus 4/4 dengan perbaikan.

## Notes
- 2026-10-16T01:59:03Z Ditemukan review T-018 r3 (integrity): layar 1440/1920 px, kartu KPI h=2 lebar ≥ 3 kolom + baris catatan h-6 'N filter tidak berlaku' → angka KPI (ukuran font container query besar) terpotong setengah; kartu sempit/tanpa catatan aman. PDF ikut terpotong bila judul 2 baris. Sumber: src/components/widgets/kpi-view.tsx (ukuran angka hanya dari lebar container, tidak memperhitungkan tinggi sisa). Arah perbaikan: batasi ukuran angka juga oleh tinggi (cqh / min(cqw,cqh)) atau ukur sisa tinggi.
- 2026-10-16T02:17:53Z Perbaikan akar masuk di commit 978656b (fix review T-018 r3): kpiHeightPx + chooseKpi(maxPx) — ukuran angka dibatasi tinggi kotak (layar + cetak). Terukur 1440 px filter Cabang: 5 KPI h=2 bercatatan utuh di 20 px (sebelum: 36 px terpotong 13,4 px); KPI tanpa catatan tetap 36 px. Sisa untuk task ini: tes regresi layar (e2e 1024/1440/1920) lalu close.
- 2026-10-16T15:41:00Z Review: integritas 0 temuan (8 non-blocking), frontend-expert:test-engineer 0 temuan (9 non-blocking). Diterapkan: tunggu ukuran inline KPI (NB-1 keduanya), setTimeout 180 s tes cetak, semua 12 angka cetak wajib ada, filter PATCH ganti sheet mewajibkan sheetId. Dilewati: angka mutlak 36 px (rapuh), varian catatan kolom kosong (mekanisme sama, sudah unit test), sentuh 44 px.
