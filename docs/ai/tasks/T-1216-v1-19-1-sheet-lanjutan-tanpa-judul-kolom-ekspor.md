---
id: T-1216
title: 'v1.19.1: sheet lanjutan tanpa judul kolom (ekspor Excel terpecah) dikenali dan digabung; Gabungkan tercentang bawaan un…'
status: done
profile: standard
created: "2026-11-12T05:34:25Z"
updated: "2026-11-12T06:56:04Z"
closed: "2026-11-12T06:56:04Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9cfda543cd373a88fefeae946d34dccfea97a7eb
paths:
  - CHANGELOG.md
  - content/panduan/03-unggah-data.md
  - content/panduan/15-data-per-periode.md
  - docs/runbook-deploy.md
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/upload-sheet-picker.tsx
  - src/features/ingest/ingest.ts
  - src/features/ingest/merge-sheets.ts
  - src/features/ingest/period-ingest.ts
  - src/features/whats-new/entries.ts
  - tests/e2e/helpers.ts
  - tests/e2e/ingest.spec.ts
  - tests/features/ingest/merge-sheets.test.ts
  - tests/features/ingest/period-ingest.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T06:14:24Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-12T06:14:25Z"
      findings: 3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 222395
    summary: |-
      …n't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794466539209,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794466539231,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794466539237,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794466539249,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794466544119,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3358 passed | 10 skipped (3368)
         Start at  06:53:34
         Duration  138.93s (tests 81%, import 16%, transform 3%)

          Isolate  254 workers spawned · ~104ms startup each (spawn + environment, per file)
                   at least ~8.72s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.19.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-12T06:55:54Z"
    tree: 4e155cc1c9950b36a03b19455a93b15452e82ea5476a2a66cb264feb5134761f
  commits:
    - 2a4785d
    - 3b6ad9e
    - aa93391
    - c4eab09
    - c4f995f
    - e6e94a4
  acceptance:
    total: 3
    done: 3
---

## Objective
Ekspor Excel yang terpecah ke beberapa sheet (mis. Billing "os invoice", "os invoice(2)"…), dengan judul kolom hanya di sheet pertama, terbaca sebagai satu data: sheet lanjutan tanpa baris judul dikenali (sheet sebelumnya penuh ≥ 50.000 baris, jumlah kolom sama, jenis isi cocok) dan digabung dengan judul sheet sebelumnya, di mode biasa (Gabungkan, kini tercentang bawaan untuk dataset baru) maupun mode periode.

## Acceptance criteria
- [x] Sheet tanpa baris judul (jumlah kolom sama, baris pertama bukan judul, jenis nilai per kolom cocok dengan data sheet sebelumnya) dikenali sebagai lanjutan: memakai judul sheet sebelumnya, semua barisnya data, digabung (mode biasa dengan Gabungkan, dan mode periode)
- [x] Gabungkan sheet tercentang bawaan untuk dataset baru dan data aktif yang hasil gabungan
- [x] Sheet berbeda tidak ikut tergabung (uji negatif); uji unit + integrasi + e2e; panduan

## Risk
Impact: salah gabung tabel lain → dicegah syarat sheet penuh + kolom pembeda (uji negatif). Security: tidak ada permukaan baru. Rollback: image v1.19.0 membaca segmen headerRow 0 apa adanya. Validation: unit + integrasi + e2e penuh.

## Notes
- 2026-11-12T05:34:27Z Kasus pemilik 2026-11-12: Billing os invoice … os invoice(5), sheet (2)–(5) tanpa judul (judul terbaca sebagai data). headerRow 0 = semua baris data (_row > 0).
- 2026-11-12T06:14:32Z Review 1 (3b6ad9e): H1 deteksi lanjutan terlalu longgar, H2 5 e2e rusak oleh Gabungkan bawaan → 2a4785d. Review 2: 0 blokir; M1/M2/L-a diperbaiki (aa93391: leader ≥ 50.000 baris, kolom pembeda berbasis rasio, lanjutan dari leader yang diabaikan ikut diabaikan). L2 (recast sheet satu segmen headerRow 0) → T-zjwh.
- 2026-11-12T06:52:11Z e2e penuh lulus kecuali data-view-a11y (T-7377, lama); chart-polish lulus saat diulang (9/9). Uji unit ingest 389.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-12T06:55:54Z (222395 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 2a4785d, 3b6ad9e, aa93391, c4eab09, c4f995f, e6e94a4
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-reviewer-subagent: 3 findings
