---
id: T-064
title: Dokumentasikan Lihat data dan data per periode untuk pengguna, siapkan UAT
status: blocked
profile: standard
goal: G-6
tags:
  - docs
  - uat
depends_on:
  - T-063
  - T-061
  - T-048
  - T-020
created: "2026-10-15T02:30:59Z"
updated: "2026-10-21T03:52:22Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: a75cc9ff6dc9b6742609f5f7688404ba8ecea271
paths:
  - content/panduan/05-ganti-data-pemetaan.md
  - content/panduan/08-editor-ubah-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - content/panduan/14-lihat-data-seperti-excel.md
  - content/panduan/15-data-per-periode.md
  - docs/flow-kerja.md
  - docs/runbook-deploy.md
  - tests/e2e/guide-content.spec.ts
  - tests/features/guides/content.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T03:48:33Z"
      findings: 1
    - "n": 2
      by: claude-code
      at: "2026-10-21T03:48:33Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197466
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792554670409,"service":"data-dashboard","host":"127.0.0.1","port":38469,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792554670468,"service":"data-dashboard","host":"127.0.0.1","port":46633,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792554670567,"service":"data-dashboard","host":"127.0.0.1","port":34249,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792554670669,"service":"data-dashboard","host":"127.0.0.1","port":42747,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792554678425,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792554689457,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792554689478,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792554689481,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792554689496,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  204 passed | 1 skipped (205)
            Tests  2689 passed | 10 skipped (2699)
         Start at  03:49:32
         Duration  137.09s (tests 85%, import 13%, transform 2%)

          Isolate  205 workers spawned · ~151ms startup each (spawn + environment, per file)
                   at least ~10.14s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T03:51:51Z"
    tree: 73e7e5ec025c09eb5f685ed07b45768a3bc86a86addfadbaa9059a2ceb08765b
  commits:
    - 03a0095
    - 08ca5b4
    - 0cb153a
    - 0e22c88
    - "1220871"
    - 14bbbc8
    - "1781974"
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 277b913
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 2d82efa
    - 2ed6480
    - 337259e
    - 35f92f6
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 4060d62
    - 4679db1
    - 49f49a5
    - 4ad60dc
    - 4bd9881
    - 4e9a95e
    - 4eea84c
    - 5101f51
    - 538221d
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 57df970
    - 58fdf0c
    - 59ec9a3
    - "6123427"
    - 62b718d
    - 62ec216
    - 65e370c
    - 686497c
    - 69b8953
    - 69fdcf7
    - 6a7cef1
    - 6b3ee3f
    - 70136f5
    - "7153066"
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8199692"
    - "8570e80"
    - 8c08ba4
    - 8f6ef33
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - 9159d7c
    - "9298e14"
    - 930dd6d
    - 94bea50
    - 94d85a4
    - 9bd7e54
    - 9ced9f4
    - 9f78595
    - a019f8f
    - a03481c
    - a0e1646
    - a5360dd
    - a687d4c
    - a75cc9f
    - a8f9162
    - acb27a6
    - acf0247
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b20b40b
    - b30aea5
    - b32d50d
    - b42141b
    - b8e59ee
    - b933279
    - ba2efef
    - bafb4ad
    - bcbddee
    - c15362c
    - c1a5b7f
    - c1c8b0a
    - c2fd95c
    - c3626c9
    - c5a63b7
    - c751cbb
    - c76c343
    - ca5782f
    - ccd0a9a
    - ce26ca5
    - ce5d6a7
    - ce649d0
    - cf28ad3
    - cf730c5
    - d32a8ea
    - d4c2029
    - d557c9e
    - d602f56
    - da46e35
    - dfc2ebb
    - dff9b8c
    - e24e070
    - e2f1df7
    - e51fcb4
    - e94e670
    - edcbdff
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fae1c8b
    - fc288cb
    - fc87996
    - fef8c19
  acceptance:
    total: 3
    done: 2
  audit:
    at: "2026-10-21T03:51:52Z"
    passed: true
    tree: 73e7e5ec025c09eb5f685ed07b45768a3bc86a86addfadbaa9059a2ceb08765b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4092 inodes visited, 1 Extract calls, 234.534396ms elapsed, 234.534903ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-32, Fase 4. Perkiraan 1–2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given semua task selesai, then project-context, decisions, dan flow-kerja mencerminkan perilaku akhir (D15, D16, A4, D4)
- [x] Given panduan per peran (T-020), then terbit artikel 'Mengunggah data per periode' (batas, tinjauan, pulihkan) dan 'Melihat data seperti Excel' (yang bisa dan tidak bisa, salin, unduh)
- [x] Given aitk uat, then skrip UAT pemilik untuk kedua fitur tersedia dalam bahasa Indonesia

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
**Dikerjakan (2026-10-21, claude-code cloud)**
- AC2 panduan (content/panduan, format frontmatter + markdown tersanitasi yang sama dengan T-020/T-xfzy):
  - baru `14-lihat-data-seperti-excel.md` (OWNER): siapa bisa membuka (pemilik/editor/viewer-Perbesar), tata
    letak, urut/saring/cari, atur kolom, Ke baris + ringkasan kolom, Isi sel, salin ke Excel, Unduh tampilan,
    versi berganti, ponsel, pintasan keyboard, tabel "yang bisa dan belum bisa".
  - baru `15-data-per-periode.md` (OWNER, bantuan UPLOAD): Atur periode, unggah + pemilih periode, tinjauan,
    batas + meter + pesan tolak, kelola (unggah ulang/hapus/pulihkan/rollback), antrean, kelompok file,
    pemetaan + aturan beku, atur ulang periode, kolom Periode di widget/filter/Lihat data.
  - diperluas: 08 editor (bagian "Melihat seluruh data (Lihat data)", daftar yang tidak bisa diperbaiki),
    09 viewer ("Memperbesar tabel" + filter Periode), 05 ganti data (tautan ke data per periode).
  - Semua label UI dicek ke kode komponen (grid/*, datasets/period-*, upload-queue, table-expand).
- AC1: docs/flow-kerja.md (A3 Lihat data/Perbesar; A4 antrean T-059, kelompok T-060, atur ulang T-qqyx,
  PERIOD_OUT_OF_WINDOW, aturan beku, kolom Periode; B3 judul per file typed T-gcn8; B5 AWAITING_CONFIRM +
  VersionMode; B7 baru Lihat data termasuk cache urutan T-062, isolasi beban, aria-rowcount; D15/D16 diperbarui),
  docs/ai/project-context.md (manifest segmen, Lihat data, batas periode, D1–D16). docs/ai/decisions.md
  dibangkitkan aitk dari ADR (tidak disunting); ADR-0007 tetap `proposed` sampai uji pembaca layar pemilik.
- AC3: `aitk uat script T-064` lalu ditulis ulang dalam bahasa Indonesia: docs/ai/uat/T-064.md — persiapan
  (data uji, akun, seed panduan), A1–A9 Lihat data, B1–B10 data per periode, C1–C3 dokumentasi, D1–D6
  pemeriksaan/keputusan tertunda (NVDA/VoiceOver + frontend-expert audit T-043/T-048, aria-rowcount T-048,
  lompatan terurut T-062, perf VM T-061, backup VM T-063, upgrade olympus T-023). UAT TIDAK diterima agen.
- Runbook §Isi panduan: perintah seed `--update --only` untuk 5 artikel T-064.
- Bukti: unit tests/features/guides/content.test.ts (+1 uji AC2) 21/21 bersama markdown.test; e2e
  guide-content 3/3 (baru: artikel terender, 3+2 tabel, urutan tab Pemilik, editor/viewer, 404 viewer),
  guide-roles 8/8, guides 6/6.

**Asumsi**
- AC1 "semua task selesai": T-043/T-048/T-061/T-062/T-063/T-023 masih blocked menunggu pemilik/VM; dokumen
  mencerminkan perilaku kode sekarang dan menyebut keputusan yang tertunda. Bila keputusan D2/D3 mengubah
  perilaku, flow-kerja B7/D16 perlu disesuaikan.
- Artikel Lihat data berperan OWNER (editor mendapat ringkasan di artikel editor) karena satu artikel hanya
  satu peran; editor tanpa dataset tidak melihat artikel OWNER.
- docs/ringkasan-dokumentasi.md (+ PDF) tidak diubah: ringkasan manajemen bertanggal 19 Okt, di luar AC.

**Sisa untuk pemilik**: jalankan UAT (docs/ai/uat/T-064.md) setelah upgrade olympus, lalu
`aitk uat accept|reject T-064`.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya dokumen, isi panduan, dan uji; tidak ada komponen/batas kepercayaan baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah; uji memakai helper akun e2e yang ada tanpa password di repo
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: artikel baru berperan OWNER; e2e memastikan viewer mendapat 404 untuk data-per-periode (filter peran T-020 tidak berubah)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: isi panduan lewat parseGuideFile (zod + guideBodyProblem) dan dirender rehype-sanitize; tanpa HTML mentah; e2e tabel terender tanpa markdown mentah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan/kunci baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: dokumen, panduan, dan skrip UAT tanpa rahasia/data pribadi (email pemilik tidak ditulis); perintah tidak mencetak .env
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tanpa dependensi atau kode aplikasi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis baru; dokumen menjelaskan batas yang sudah ditegakkan server
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru (content/panduan ikut image lewat COPY yang sudah ada)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: tidak ada perubahan konfigurasi; runbook hanya menambah perintah seed --only yang tidak menimpa artikel lain

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T03:51:51Z (197466 ms)
- Acceptance criteria: 2/3 satisfied
- Commits: 03a0095, 08ca5b4, 0cb153a, 0e22c88, 1220871, 14bbbc8, 1781974, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 277b913, 27924c4, 27986dc, 29fe0f3, 2d7b316, 2d82efa, 2ed6480, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 4060d62, 4679db1, 49f49a5, 4ad60dc, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 58fdf0c, 59ec9a3, 6123427, 62b718d, 62ec216, 65e370c, 686497c, 69b8953, 69fdcf7, 6a7cef1, 6b3ee3f, 70136f5, 7153066, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8199692, 8570e80, 8c08ba4, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, 9ced9f4, 9f78595, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a75cc9f, a8f9162, acb27a6, acf0247, ae4e5a2, af1994a, b0b99d8, b20b40b, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1a5b7f, c1c8b0a, c2fd95c, c3626c9, c5a63b7, c751cbb, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e2f1df7, e51fcb4, e94e670, edcbdff, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fae1c8b, fc288cb, fc87996, fef8c19
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-code: 0 findings
