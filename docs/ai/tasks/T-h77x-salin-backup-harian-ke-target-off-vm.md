---
id: T-h77x
title: Salin backup harian ke target off-VM
status: in_progress
profile: standard
tags:
  - security
depends_on:
  - T-023
created: "2026-10-17T05:18:25Z"
updated: "2026-10-19T05:45:52Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 8f8df3807766097606a7b579101cd77cb4917b0e
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 52522
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

      {"level":40,"time":1792388725248,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792388725269,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792388725271,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792388725276,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792388728828,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  149 passed (149)
            Tests  1962 passed (1962)
         Start at  12:45:14
         Duration  35.49s (tests 81%, import 14%, transform 4%)

          Isolate  149 workers spawned · ~142ms startup each (spawn + environment, per file)
                   at least ~2.21s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T05:45:52Z"
    tree: 4ac0313eafbce008f84cdad58a330938311c14e0775373cdb599a172d1afe21e
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given BACKUP_REMOTE berisi target off-VM (NAS/SFTP/S3) di .env.prod, when backup harian berjalan, then arsip .tar.age beserta .sha256 tersalin ke target dan retensi 30 hari juga berlaku di sana
- [ ] Given target off-VM, when verify-backup.sh dijalankan terhadap salinan off-VM, then checksum dan isi arsip valid

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
