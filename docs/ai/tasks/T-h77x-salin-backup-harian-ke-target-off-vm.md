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
updated: "2026-10-19T06:44:15Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 8f8df3807766097606a7b579101cd77cb4917b0e
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 53379
    summary: |-
      …nts/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792392229055,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792392229079,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792392229081,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792392229085,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792392229945,"service":"data-dashboard","host":"127.0.0.1","port":49621,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792392229963,"service":"data-dashboard","host":"127.0.0.1","port":49621,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792392229969,"service":"data-dashboard","host":"127.0.0.1","port":49630,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792392229979,"service":"data-dashboard","host":"127.0.0.1","port":49632,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792392232542,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  149 passed (149)
            Tests  1963 passed (1963)
         Start at  13:43:37
         Duration  36.10s (tests 80%, import 15%, transform 5%)

          Isolate  149 workers spawned · ~145ms startup each (spawn + environment, per file)
                   at least ~2.25s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T06:44:15Z"
    tree: 8f108246d6bc35bff601f0b4b281717769adcd157f1d4046eacc2b9f37821dc3
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given BACKUP_REMOTE berisi target off-VM (NAS/SFTP/S3) di .env.prod, when backup harian berjalan, then arsip .tar.age beserta .sha256 tersalin ke target dan retensi 30 hari juga berlaku di sana
- [ ] Given target off-VM, when verify-backup.sh dijalankan terhadap salinan off-VM, then checksum dan isi arsip valid

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
