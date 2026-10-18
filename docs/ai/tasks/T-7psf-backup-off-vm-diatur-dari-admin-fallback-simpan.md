---
id: T-7psf
title: Backup off-VM diatur dari Admin, fallback simpan lokal + kirim ulang, notifikasi admin
status: in_review
profile: standard
tags:
  - security
created: "2026-10-18T13:25:38Z"
updated: "2026-10-18T14:16:28Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 628e5548c5469068726f116c6107186785fcdc39
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-18T14:01:10Z"
      findings: 7
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-18T14:11:13Z"
      findings: 3
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-18T14:16:28Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 78976
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

      {"level":40,"time":1792330980603,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792330980626,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792330980629,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792330980639,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792330984728,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  147 passed (147)
            Tests  1907 passed (1907)
         Start at  20:42:40
         Duration  54.19s (tests 76%, import 18%, transform 5%)

          Isolate  147 workers spawned · ~240ms startup each (spawn + environment, per file)
                   at least ~3.68s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-18T13:43:37Z"
    tree: e6ae98649dc64ffb71a2afff1d5083b459a24aec7e0d5da28fc6066c0efaff79
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given admin membuka Admin › Backup, when mengisi endpoint S3, bucket, folder, access key, dan secret lalu menekan Tes koneksi atau Simpan, then koneksi diuji tulis-baca-hapus dengan pesan yang jelas, konfigurasi tersimpan tanpa secret pernah ditampilkan ulang atau dicatat di log/DB, audit tercatat, dan backup berikutnya memakai target itu tanpa edit .env atau SSH
- [ ] Given target off-VM tidak terjangkau (down, jaringan, kunci salah), when backup harian berjalan, then arsip tetap dibuat dan ditahan di VM (tidak dihapus retensi lokal sebelum tersalin, kecuali melewati retensi penuh), dicoba kirim ulang tiap 30 menit, dan semua arsip tertunda tersalin begitu target terjangkau lagi
- [ ] Given backup gagal atau salinan off-VM tertunda, when status berubah, then setiap admin aktif menerima email sekali per perubahan (termasuk saat pulih) dan admin melihat banner serta status di Admin › Backup; backup yang tidak berjalan > 26 jam juga tampil sebagai peringatan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
