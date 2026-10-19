---
id: T-sew3
title: 'Panduan developer: peta kode, resep modifikasi, tes, dan rilis'
status: in_review
profile: standard
created: "2026-10-19T07:19:36Z"
updated: "2026-10-19T07:49:41Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3602b55aed18e0117c9d61283077ebf9cce03a81
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T07:49:41Z"
      findings: 5
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 51409
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792396148630,"service":"data-dashboard","host":"127.0.0.1","port":64277,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792396148638,"service":"data-dashboard","host":"127.0.0.1","port":64286,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792396148678,"service":"data-dashboard","host":"127.0.0.1","port":64288,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792396148715,"service":"data-dashboard","host":"127.0.0.1","port":64292,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792396151079,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792396151101,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792396151103,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792396151108,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792396154664,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  149 passed (149)
            Tests  1965 passed (1965)
         Start at  14:48:59
         Duration  35.02s (tests 81%, import 14%, transform 4%)

          Isolate  149 workers spawned · ~141ms startup each (spawn + environment, per file)
                   at least ~2.20s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T07:49:36Z"
    tree: 168ff55817f85df37c058e1cba36b68bdc40fbcf89eb86c243e93b0a8fd5773a
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given programmer baru yang belum pernah membuka repo, when membaca docs/panduan-developer.md, then ia bisa menyiapkan lingkungan lokal, menjalankan aplikasi + worker + tes, dan menemukan modul untuk tiap fitur (upload/ingest, query, dashboard/widget, ekspor/PDF, berbagi, admin, backup, panduan)
- [ ] Given kebutuhan modifikasi umum (tipe widget, agregasi, filter, halaman admin, job worker, model Prisma, variabel env, artikel panduan), when mengikuti resep di panduan, then daftar file yang harus diubah sesuai kode saat ini
- [ ] Given rilis ke produksi, when mengikuti panduan, then langkah tes, review, deploy, dan rollback merujuk runbook dan alur aitk yang berlaku

## Risk
Impact: hanya dokumentasi + satu skrip bantu: docs/panduan-developer.md (baru), docs/ringkasan-dokumentasi.md + .pdf (baru), docs/runbook-deploy.md (ukuran VM olympus terkini; langkah pra-deploy dan rollback cepat yang sebelumnya hanya praktik manual), README.md (tautan), scripts/md-to-pdf.mjs (Markdown → PDF via Chromium Playwright), micromark sebagai devDependency eksplisit. Tidak ada perubahan kode aplikasi, skema, atau image produksi.
Security (STRIDE): Information disclosure — dokumen tidak memuat rahasia (nama variabel env saja, tanpa nilai; password/kunci tidak dicantumkan; alamat server internal sudah ada di runbook). Tampering — skrip md-to-pdf hanya membaca file lokal yang diberikan dan menulis PDF; HTML dirender di Chromium tanpa jaringan (setContent). Tidak ada endpoint baru.
Rollback: revert commit dokumentasi; tidak ada efek runtime.
Validation: peta kode dibuat dari pembacaan kode (subagen Explore), review akurasi independen 2 putaran (putaran 1: 5 temuan — vCPU, langkah pra-deploy/rollback tidak terdokumentasi + rollback tanpa kode/IMAGE_TAG, jumlah task G-6, file schema, daftar duration — semua diperbaiki), PDF dirender ulang dan diperiksa visual (4 halaman), aitk check hijau (1965 tes).

## Notes
