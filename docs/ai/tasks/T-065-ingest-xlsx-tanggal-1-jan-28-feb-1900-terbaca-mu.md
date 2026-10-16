---
id: T-065
title: 'Ingest XLSX: tanggal 1 Jan–28 Feb 1900 terbaca mundur satu hari (bug tahun kabisat 1900 Excel)'
status: in_progress
profile: standard
goal: G-3
tags:
  - bug
created: "2026-10-15T19:47:05Z"
updated: "2026-10-16T15:47:50Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: a01a9ef33c04775e308d26e0eb6222594e049296
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 41355
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

      {"level":40,"time":1792165649188,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792165649224,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792165649233,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1683 passed (1683)
         Start at  22:47:21
         Duration  27.12s (tests 72%, import 19%, transform 9%, worker 1%)

          Isolate  117 workers spawned · ~148ms startup each (spawn + environment, per file)
                   at least ~1.78s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T15:47:50Z"
    tree: 4baa3394b948fa743bda3ecee8dc36978c0db0338851664fb62be9eb9d9df941
---

## Objective
Ditemukan saat review T-017 INT-2: src/lib/xlsx/parser.ts memakai epoch 1899-12-30 tanpa koreksi bug tahun kabisat 1900 Excel, sedangkan writer ekspor T-017 sudah mengoreksinya. Dampak praktis kecil (data pengiriman jarang berisi Jan–Feb 1900), tapi impor harus cocok dengan Excel. Perbaiki di parser + regression test; jangan ubah perilaku ekspor.

## Acceptance criteria
- [ ] Given file XLSX dari Excel berisi tanggal 1900-01-01, 1900-02-28, 1900-03-01 dan 2024-01-02 (serial 1, 59, 61, 45293), when diingest, then nilai tanggal di dataset sama persis dengan yang tampil di Excel (bukan mundur satu hari untuk serial < 61)
- [ ] Given serial 60 (29 Feb 1900 fiktif Excel), when diingest, then tidak menjadi tanggal salah diam-diam (ditandai gagal cast atau dipetakan jelas) dan tanggal 1900-03-01 ke atas tidak berubah

## Risk
Impact: hanya ingest XLSX sistem tanggal 1900 untuk sel bertanggal bernomor seri 1–60 (1 Jan–29 Feb 1900); seri ≥ 61, sistem 1904, jam (h:mm) dan durasi ([h]:mm) tidak berubah; data lama tidak di-ingest ulang (berlaku untuk unggahan/versi baru). Security (STRIDE): tidak ada permukaan baru — parser tetap memakai batas yang sama; seri 60 menjadi teks konstan (bukan dari isi file). Rollback: revert commit parser. Validation: tes parser (seri 1/59/60/61/45293/59,5, format kustom, h:mm, [h]:mm:ss, 1904) + tes ingest DuckDB sungguhan (kolom DATE, seri 60 = 1 gagal cast → NULL); keduanya gagal tanpa perbaikan.

## Notes
