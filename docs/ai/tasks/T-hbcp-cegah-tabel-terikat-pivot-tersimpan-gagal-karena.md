---
id: T-hbcp
title: Cegah tabel terikat pivot tersimpan gagal karena total berjalan dan Top N di baris terdalam
status: in_progress
profile: standard
goal: G-7
tags:
  - bug
created: "2026-10-21T19:46:57Z"
updated: "2026-10-21T20:51:16Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: ee2a97615c2766c7a7d4fae0cde92acee007b661
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 195852
    summary: |-
      …t":"127.0.0.1","port":42947,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792615802420,"service":"data-dashboard","host":"127.0.0.1","port":33719,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792615802521,"service":"data-dashboard","host":"127.0.0.1","port":44127,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792615802638,"service":"data-dashboard","host":"127.0.0.1","port":34601,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792615803988,"service":"data-dashboard","datasetId":"t072mvil5xzcds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792615811388,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792615825370,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792615825395,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792615825400,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792615825418,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  224 passed | 1 skipped (225)
            Tests  3019 passed | 10 skipped (3029)
         Start at  20:48:30
         Duration  133.75s (tests 82%, import 14%, transform 3%)

          Isolate  225 workers spawned · ~141ms startup each (spawn + environment, per file)
                   at least ~10.47s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T20:50:45Z"
    tree: 90c68b3294ce37516d0d9bf0cadb473c737d439b10f77672523a4e712d9c58f5
  audit:
    at: "2026-10-21T20:50:51Z"
    passed: true
    tree: 90c68b3294ce37516d0d9bf0cadb473c737d439b10f77672523a4e712d9c58f5
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5162 inodes visited, 1 Extract calls, 224.499411ms elapsed, 224.499611ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.2.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Ditemukan T-075: pivot tersimpan dengan Pisahkan per (kolom pemisah) + Top N pada baris terdalam + nilai Total berjalan/Selisih sah (sumbu = kolom pemisah). Widget tabel terikat membuang kolom pemisah (src/features/widgets/bound.ts effectiveConfig case table) sehingga sumbu pindah ke baris terdalam ber-Top N dan spec efektif ditolak TOP_N_AXIS_TEXT; pengguna melihat 'Pengaturan widget ini tidak cocok lagi dengan sumber datanya. Pilih ulang nilai…' yang tidak bisa diperbaiki dari panel tabel (tabel tidak memilih nilai). Keputusan standar yang aman: di tabel, nilai bercara tampil sumbu (running/diff_prev/pct_diff_prev) ditampilkan sebagai nilai biasa dengan catatan, atau panel pivot tersimpan memperingatkan saat menyimpan; catat pilihan di ADR-0009.

## Acceptance criteria
- [x] Given pivot tersimpan kolom pemisah + Top N baris terdalam + Total berjalan, when widget tabel diikat, then tabel tampil (bukan galat) dengan catatan cara tampil yang tidak berlaku, dan uji unit effectiveConfig

## Risk
Impact: spec efektif widget tabel terikat (features/widgets/bound.ts) hanya untuk kombinasi yang dulu
galat; hasil query mendapat field opsional `ignoredShowAs` (kartu, tabel diperbesar, PDF). Widget lain,
kunci cache widget mandiri, dan pivot tersimpan tidak berubah.
Security (STRIDE): I (information disclosure) — catatan hanya menyebut label cara tampil (sudah tampil
di judul kolom pemilik), tanpa nama/definisi pivot tersimpan; viewer menerima teks yang sama.
Rollback: revert commit T-hbcp (tabel kembali menampilkan galat "Pilih ulang nilai").
Validation: tests/features/widgets/bound.test.ts (T-hbcp), tests/features/query/bound-widgets.test.ts
(pemilik + viewer), tests/components/widget-absent.test.ts; e2e --project=widgets.

## Notes
- Keputusan (ADR-0009, entri T-hbcp): di tabel, Total berjalan/Selisih/% selisih yang sumbunya jatuh ke
  baris terdalam ber-Top N tampil sebagai nilai biasa + catatan "… tidak berlaku di tabel ini (tanpa
  Pisahkan per, baris terdalam memakai Top N): nilainya tampil sebagai nilai biasa." (data-testid
  widget-ignored-show-as di kartu; Note di print-card). Tidak ditolak saat menyimpan pivot tersimpan
  karena definisi itu sah untuk pivot/grafik.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Terverifikasi: jalur otorisasi widget (runWidgetQuery/forRole) tidak berubah; catatan ikut jawaban yang sudah diotorisasi.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Terverifikasi: spec efektif tetap divalidasi parseWidgetConfig (zod); tanpa SQL baru; catatan dirender sebagai teks React (ter-encode).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Terverifikasi: catatan hanya label cara tampil (sudah tampil di judul kolom), tanpa nama/definisi pivot tersimpan; viewer mendapat teks sama (uji bound-widgets).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
