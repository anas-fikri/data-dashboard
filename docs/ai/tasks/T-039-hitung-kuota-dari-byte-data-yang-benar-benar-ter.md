---
id: T-039
title: Hitung kuota dari byte data yang benar-benar tersimpan
status: in_progress
profile: standard
goal: G-6
tags:
  - quota
  - security
  - migration
depends_on:
  - T-038
created: "2026-10-15T02:30:55Z"
updated: "2026-10-19T22:20:16Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 1b2b9ab2a9813c2f0fee3be789538479965fdef2
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 89950
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448373132,"service":"data-dashboard","host":"127.0.0.1","port":54797,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448373143,"service":"data-dashboard","host":"127.0.0.1","port":54806,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792448373157,"service":"data-dashboard","host":"127.0.0.1","port":54808,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448373200,"service":"data-dashboard","host":"127.0.0.1","port":54812,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448375845,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792448378021,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792448378044,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792448378046,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792448378056,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  162 passed (162)
            Tests  2099 passed (2099)
         Start at  05:19:16
         Duration  57.94s (tests 78%, import 17%, transform 5%)

          Isolate  162 workers spawned · ~193ms startup each (spawn + environment, per file)
                   at least ~3.28s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T22:20:16Z"
    tree: 3addcf368683a53bce8203bf8fbf4fc174793327b7f39cdc29224212bb0ee997
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-7, Fase 1. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given pengguna dengan segmen hidup, file sumber yang belum dihapus, dan versi UPLOADING, when kuota dihitung, then pemakaian = byte segmen unik terujuk + byte sumber tersimpan + ukuran terdeklarasi UPLOADING, dengan setiap segmen dihitung sekali
- [ ] Given proyeksi melewati USER_STORAGE_QUOTA_BYTES, when init, then QUOTA_EXCEEDED 'terpakai X dari Y' sebelum byte pertama terunggah, sizeBytes tetap ukuran file, dan test multipart lama lolos
- [ ] Given migrasi makna kuota, then laporan pemakaian per pengguna tercetak, selama QUOTA_GRACE_DAYS pelanggaran hanya diberi peringatan, banner tampil di ≥ 80%, dan e2e kuota diperbarui

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
