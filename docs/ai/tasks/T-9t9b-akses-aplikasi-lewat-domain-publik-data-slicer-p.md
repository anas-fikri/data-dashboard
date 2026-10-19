---
id: T-9t9b
title: Akses aplikasi lewat domain publik data-slicer.pcpexpress.com di belakang Nginx Proxy Manager
status: in_progress
profile: standard
tags:
  - security
created: "2026-10-19T08:48:25Z"
updated: "2026-10-19T09:39:43Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3bb3baa5bada8f11f6acd698a0497d56871195e3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 64664
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792402367618,"service":"data-dashboard","host":"127.0.0.1","port":64364,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792402367627,"service":"data-dashboard","host":"127.0.0.1","port":64373,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792402367641,"service":"data-dashboard","host":"127.0.0.1","port":64375,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792402367665,"service":"data-dashboard","host":"127.0.0.1","port":64380,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792402370934,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792402370960,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792402370962,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792402370971,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792402375498,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  152 passed (152)
            Tests  1998 passed (1998)
         Start at  16:32:37
         Duration  43.59s (tests 79%, import 16%, transform 5%)

          Isolate  152 workers spawned · ~173ms startup each (spawn + environment, per file)
                   at least ~2.75s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T09:33:22Z"
    tree: 06a5a373555b2e2f961247cff695b488877d2cf3d564f68bbbfe9857dcde3644
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given domain data-slicer.pcpexpress.com diteruskan Nginx Proxy Manager ke Caddy, when dibuka di browser, then aplikasi tampil dan bisa login, bukan halaman kosong
- [ ] Given akses lewat domain maupun lewat IP 10.3.3.221:8443, when pengguna login dan mengunggah, then keduanya berjalan (CORS mengizinkan kedua alamat) dan IP pengguna yang tercatat bukan IP proxy

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
