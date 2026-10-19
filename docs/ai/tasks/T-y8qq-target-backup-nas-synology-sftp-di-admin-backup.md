---
id: T-y8qq
title: Target backup NAS Synology (SFTP) di Admin › Backup menggantikan S3
status: in_progress
profile: standard
tags:
  - security
created: "2026-10-19T03:40:22Z"
updated: "2026-10-19T04:41:38Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 17d81a7fb48c5e171c2e55b97e8d2a45b9929b6b
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 117301
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

      {"level":40,"time":1792384848988,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792384849011,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792384849013,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792384849025,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792384857979,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  149 passed (149)
            Tests  1961 passed (1961)
         Start at  11:40:26
         Duration  69.59s (tests 79%, import 16%, transform 4%)

          Isolate  149 workers spawned · ~292ms startup each (spawn + environment, per file)
                   at least ~4.54s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T04:41:38Z"
    tree: f5172953d8344996407629ed0ae2203dc3fc49ff43ef95bb5127c34389d4993d
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin di Admin › Backup, when mengisi host, port, username, password, dan folder NAS Synology lalu menekan Tes koneksi, then server aplikasi menulis, membaca, dan menghapus file uji di folder itu lewat SFTP dan menampilkan sidik jari kunci host yang dipin; password salah, folder tidak ada, host tidak terjangkau, atau kunci host berubah menampilkan pesan yang bisa ditindak
- [ ] Given target Synology tersimpan dan aktif, when backup harian atau kirim ulang 30 menit berjalan, then arsip disalin ke folder NAS lewat SFTP yang hanya menerima kunci host yang dipin, password tidak muncul di argumen proses, status, atau log, dan bila NAS tidak terjangkau arsip ditahan di server dengan notifikasi admin seperti sebelumnya
- [ ] Given halaman Admin, when dibuka admin, then pengaturan Email (SMTP) dan Backup ke NAS Synology tampil sebagai bagian Integrasi dan pilihan target S3 tidak lagi ditawarkan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
