---
id: T-1tzp
title: Video panduan Satu pivot untuk banyak widget
status: done
profile: standard
created: "2026-10-22T01:53:57Z"
updated: "2026-10-22T02:17:09Z"
closed: "2026-10-22T02:17:09Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f8903225347758d8786def1e21ddc97aaa066573
paths:
  - docs/runbook-deploy.md
  - scripts/guide-narration.json
  - scripts/record-guide-videos.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T02:13:09Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-22T02:13:09Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 198816
    summary: |-
      …tasetId":"t072mviwsfb8ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792635333888,"service":"data-dashboard","host":"127.0.0.1","port":43131,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792635333943,"service":"data-dashboard","host":"127.0.0.1","port":45397,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792635334051,"service":"data-dashboard","host":"127.0.0.1","port":32949,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792635334161,"service":"data-dashboard","host":"127.0.0.1","port":45179,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792635344469,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792635356838,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792635356860,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792635356866,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792635356878,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3025 passed | 10 skipped (3035)
         Start at  02:14:11
         Duration  136.26s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~119ms startup each (spawn + environment, per file)
                   at least ~8.87s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T02:16:29Z"
    tree: 92e0fe77a7521eb8f80b5f64518d41205fd84a7c3ad7e871cbf6b756ad4975db
  commits:
    - d55a8d0
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-10-22T02:16:30Z"
    passed: true
    tree: 92e0fe77a7521eb8f80b5f64518d41205fd84a7c3ad7e871cbf6b756ad4975db
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 530 dirs visited, 5491 inodes visited, 1 Extract calls, 232.212446ms elapsed, 232.212833ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.3.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-22T02:16:29Z (198816 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: d55a8d0
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-code: 0 findings
