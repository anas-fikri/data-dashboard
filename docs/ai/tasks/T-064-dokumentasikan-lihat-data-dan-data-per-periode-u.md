---
id: T-064
title: Dokumentasikan Lihat data dan data per periode untuk pengguna, siapkan UAT
status: in_progress
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
updated: "2026-10-21T03:46:15Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: a75cc9ff6dc9b6742609f5f7688404ba8ecea271
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 190787
    summary: |-
      …r: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792554305658,"service":"data-dashboard","host":"127.0.0.1","port":34529,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792554305712,"service":"data-dashboard","host":"127.0.0.1","port":34319,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792554305807,"service":"data-dashboard","host":"127.0.0.1","port":45765,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792554305910,"service":"data-dashboard","host":"127.0.0.1","port":44085,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792554314184,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792554324145,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792554324168,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792554324173,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792554324182,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  204 passed | 1 skipped (205)
            Tests  2689 passed | 10 skipped (2699)
         Start at  03:43:31
         Duration  130.55s (tests 85%, import 12%, transform 2%)

          Isolate  205 workers spawned · ~140ms startup each (spawn + environment, per file)
                   at least ~9.44s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T03:45:43Z"
    tree: 73e7e5ec025c09eb5f685ed07b45768a3bc86a86addfadbaa9059a2ceb08765b
  audit:
    at: "2026-10-21T03:45:50Z"
    passed: true
    tree: 73e7e5ec025c09eb5f685ed07b45768a3bc86a86addfadbaa9059a2ceb08765b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4067 inodes visited, 1 Extract calls, 220.24442ms elapsed, 220.244649ms wall time
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
- [ ] Given panduan per peran (T-020), then terbit artikel 'Mengunggah data per periode' (batas, tinjauan, pulihkan) dan 'Melihat data seperti Excel' (yang bisa dan tidak bisa, salin, unduh)
- [ ] Given aitk uat, then skrip UAT pemilik untuk kedua fitur tersedia dalam bahasa Indonesia

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
