---
id: T-rrn1
title: 'Saringan pivot lanjutan: angka di luar batas aman dan ringkasan bagian Saring'
status: in_progress
profile: standard
depends_on:
  - T-f4a7
created: "2026-10-19T16:45:51Z"
updated: "2026-10-20T05:45:33Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f5b2aa6b867c729efcc23e37420e6be39bf46a45
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 160908
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792475057128,"service":"data-dashboard","host":"127.0.0.1","port":40101,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792475057183,"service":"data-dashboard","host":"127.0.0.1","port":35031,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792475057283,"service":"data-dashboard","host":"127.0.0.1","port":44035,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792475057386,"service":"data-dashboard","host":"127.0.0.1","port":42981,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792475062874,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792475072040,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792475072063,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792475072065,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792475072075,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  163 passed | 1 skipped (164)
            Tests  2107 passed | 10 skipped (2117)
         Start at  05:43:04
         Duration  119.22s (tests 86%, import 11%, transform 3%)

          Isolate  164 workers spawned · ~139ms startup each (spawn + environment, per file)
                   at least ~7.48s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T05:45:04Z"
    tree: 2212988544b2bba9d5db67a6ff513cf704db1830df4f7118e4b3587fb2a6ec74
  audit:
    at: "2026-10-20T05:45:09Z"
    passed: true
    tree: 2212988544b2bba9d5db67a6ff513cf704db1830df4f7118e4b3587fb2a6ec74
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 832 packages
          End status: 320 dirs visited, 1680 inodes visited, 1 Extract calls, 168.555249ms elapsed, 168.555418ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Lanjutan review T-f4a7 (M4 + catatan dilewati): label pivot/grafik berupa angka di luar ±2^53 (kolom DOUBLE/DECIMAL besar) bisa dipilih di menu saring, bagian Saring, dan filter silang tanpa widget/Ekspor PDF gagal 'tidak valid' — server menerima angka finite apa pun pada nilai in/not_in dan mem-bind angka bulat tak-aman sebagai teks yang di-CAST (DOUBLE/DECIMAL); nilai di luar DECIMAL(38,6) tidak cocok, bukan galat. Kalimat ringkasan panel pivot menyebut bagian Saring tersimpan ('hanya Darat (Layanan)' / 'tanpa …').

## Acceptance criteria
- [x] Given field pivot atau kategori grafik bernilai angka di luar ±9.007.199.254.740.991, when nilai itu dipilih di menu saring atau diklik untuk filter silang, then widget dan Ekspor PDF tidak gagal 'tidak valid' (nilai itu dilewati dengan keterangan, atau tidak bisa dipilih beserta alasannya)
- [x] Given pivot dengan bagian Saring tersimpan, when panel pengaturan dibuka, then kalimat ringkasan di atas panel menyebut saringan itu (mis. 'hanya Layanan Darat')

## Risk
Impact: validasi zod nilai in/not_in (filter dashboard, silang, saringan pivot, URL/ekspor) dilonggarkan dari ±2^53 ke finite; bind parameter dashClauses/localClauses. Rentang tetap ±2^53.
Security (STRIDE): nilai tetap parameter terikat (tanpa SQL dari klien), jumlah nilai tetap ≤ 500; tidak ada kolom baru terbuka.
Rollback: revert commit.
Validation: tests/features/query/unsafe-numbers.test.ts (DuckDB sungguhan), tests/components/pivot-ui.test.ts.

## Notes
- Pendekatan AC1: nilai tidak dilewati — disaring benar (bind teks + CAST). Angka ≥ 1e32 pada kolom DECIMAL(38,6) tidak mungkin sama: in = tidak cocok, not_in = semua.
- Tanpa e2e baru: perubahan di validasi/SQL server (unit DuckDB) dan fungsi ringkasan murni (unit); e2e pivot tidak dijalankan ulang di sini.
