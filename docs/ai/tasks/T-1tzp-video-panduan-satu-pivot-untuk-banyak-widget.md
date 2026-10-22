---
id: T-1tzp
title: Video panduan Satu pivot untuk banyak widget
status: in_progress
profile: standard
created: "2026-10-22T01:53:57Z"
updated: "2026-10-22T02:13:08Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f8903225347758d8786def1e21ddc97aaa066573
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 216431
    summary: |-
      …st":"127.0.0.1","port":39347,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792635117135,"service":"data-dashboard","host":"127.0.0.1","port":36747,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792635117235,"service":"data-dashboard","host":"127.0.0.1","port":43511,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792635117345,"service":"data-dashboard","host":"127.0.0.1","port":46665,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792635119185,"service":"data-dashboard","datasetId":"t072mviwnx9jds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792635129461,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792635141327,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792635141349,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792635141352,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792635141361,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3025 passed | 10 skipped (3035)
         Start at  02:10:32
         Duration  143.92s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~118ms startup each (spawn + environment, per file)
                   at least ~8.77s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T02:12:57Z"
    tree: 92e0fe77a7521eb8f80b5f64518d41205fd84a7c3ad7e871cbf6b756ad4975db
---

## Objective
Artikel `satu-pivot-banyak-widget` punya video bernarasi seperti artikel lain: membuat pivot tersimpan dengan field terhitung (Omzet per paket = Total Omzet ÷ Total Jumlah paket, format Rupiah), memakainya di tiga widget (Batang, Angka, Pivot), lalu mengubah pivot sekali (Saring Layanan = Kilat) dan melihat ketiga widget ikut berubah.

## Acceptance criteria
- [x] Video bernarasi webm + takarir vtt + poster untuk slug satu-pivot-banyak-widget dibuat dengan alat rekam yang sama dengan video lain
- [x] Adegan bisa direkam ulang dan cara mengunggah ke produksi terdokumentasi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- Adegan `pemilik-pivot-tersimpan` di scripts/record-guide-videos.ts + 19 kalimat di scripts/guide-narration.json; bergantung pada dataset/dashboard demo dari adegan pemilik-unggah/skema/dashboard. Direkam dua kali berturut-turut (bisu lalu bersuara) tanpa galat → bisa diulang.
- Hasil: webm 176 dtk (vp9+opus, 15,6 MB) + vtt + poster; dikirim ke pemilik, tidak di-commit (gitignore). Unggah ke produksi lewat UI admin atau seed `--videos --only` (runbook "Isi panduan").
- edge-tts di container cloud perlu CA proxy: certifi.where diarahkan ke /root/.ccr/ca-bundle.crt lewat pembungkus EDGE_TTS_BIN (tidak di-commit; khusus lingkungan).
