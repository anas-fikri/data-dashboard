---
id: T-076
title: Dokumentasikan pivot lanjutan untuk pengguna, siapkan UAT dan rilis minor
status: in_progress
profile: standard
profile_pinned: true
goal: G-7
tags:
  - docs
depends_on:
  - T-075
created: "2026-10-21T10:24:17Z"
updated: "2026-10-21T21:50:39Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 7062ff748c3f8d61cbbd96beb8c65bd0d773c022
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 190268
    summary: |-
      …t":"127.0.0.1","port":46665,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792619397272,"service":"data-dashboard","host":"127.0.0.1","port":46763,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792619397375,"service":"data-dashboard","host":"127.0.0.1","port":46137,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792619397477,"service":"data-dashboard","host":"127.0.0.1","port":34953,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792619398918,"service":"data-dashboard","datasetId":"t072mvinazwrds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792619410548,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792619414713,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792619414734,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792619414741,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792619414751,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3022 passed | 10 skipped (3032)
         Start at  21:48:27
         Duration  130.89s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~137ms startup each (spawn + environment, per file)
                   at least ~10.17s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:50:39Z"
    tree: 9f0ed13c1f0ab3bc599f31323f777b0b19b29fef455da240e0ae738282190b77
  audit:
    at: "2026-10-21T21:47:03Z"
    passed: true
    tree: 9f0ed13c1f0ab3bc599f31323f777b0b19b29fef455da240e0ae738282190b77
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5313 inodes visited, 1 Extract calls, 237.272911ms elapsed, 237.273048ms wall time
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
Perbarui project-context, decisions (D17 pivot lanjutan, D6 diperjelas), flow-kerja, panduan per peran (artikel baru), skrip UAT pemilik docs/ai/uat/T-076.md, dan siapkan rilis minor G-7 lewat aitk release. UAT tidak diterima atas nama pemilik. Rencana G-7 §7 fase 5.

## Acceptance criteria
- [x] Given semua task G-7 selesai, then project-context, decisions (D17 + D6 diperjelas untuk widget terikat), flow-kerja, dan ADR-0009 (accepted + amandemen bila ada) mencerminkan perilaku akhir
- [x] Given panduan per peran (T-020), then terbit artikel 'Membuat perhitungan seperti PivotTable' (field terhitung, Tampilkan nilai sebagai, Top N/Lainnya, contoh margin dan rata-rata per kiriman) dan 'Satu pivot untuk banyak widget' (pivot tersimpan, dampak edit, hapus), lewat seed (artikel lama dengan --update --only)
- [x] Given docs/ai/uat/T-076.md, then berisi langkah UAT pemilik dengan data contoh dan hasil yang diharapkan untuk keempat fitur + versi tampil; status UAT menunggu pemilik (aitk uat), tidak diterima atas nama pemilik
- [ ] Given aitk release di main setelah UAT, then CHANGELOG memuat bagian versi minor baru dan package.json naik (rencana: 1.1.0 setelah fase 1–2, 1.2.0 setelah fase 3, 1.3.0 setelah G-7 selesai, sesuai keputusan pemilik), tag image deploy mengikuti T-066

## Risk
Impact: hanya dokumen, isi panduan (content/panduan), skrip UAT + CSV contoh, dan uji panduan; tanpa kode
aplikasi/migrasi. Artikel lama di produksi baru berubah bila seed `--update --only` dijalankan.
Security (STRIDE): tidak ada jalur data/otorisasi baru; artikel baru berperan OWNER (viewer 404, e2e).
Rollback: revert commit; artikel yang sudah di-seed dihapus/diganti admin di /admin/panduan.
Validation: unit tests/features/guides (67), e2e guide-content 4/4, guides 6/6, guide-roles 8/8; aitk check.

## Notes
**Dikerjakan (2026-10-21, claude-code cloud)**
- AC1: docs/flow-kerja.md — tabel peran (pemilik kelola pivot tersimpan, editor pilih/lepas), padanan Excel
  (Show Values As, Calculated Field, Top 10, pivot tersimpan), A3 pivot lanjutan + versi menu akun, B4 widget
  terikat (D6 diperjelas: body viewer tetap, `savedPivotId` sedataset dibaca server, filter silang dari spec
  efektif, revisi di kunci cache, ekspor dikunci revisi), B8 baru (versi, spec nilai, Tampilkan sebagai, field
  terhitung, batas 4×8 + anggaran sel, Top N, pivot tersimpan, ukur T-075), D6 diperjelas, D17 baru.
  docs/ai/project-context.md (pivot lanjutan, versi/rilis, D1–D17, catatan target p95 dingin → T-hfqf).
  ADR-0009 → accepted (syaratnya T-068 + T-072 selesai; amandemen T-068/T-072/T-073/T-hbcp sudah ada);
  docs/ai/decisions.md dibangkitkan aitk (tidak disunting tangan).
- AC2: artikel baru `16-perhitungan-seperti-pivottable.md` (OWNER, BUILDER: Tampilkan sebagai, field
  terhitung + editor token + angka Indonesia + contoh Margin/Rata-rata per kiriman/Target 10%, cara hitung
  atas total, 4×8 + subtotal per tingkat + anggaran 24.000 sel, Top N + (Lainnya), yang belum bisa) dan
  `17-satu-pivot-banyak-widget.md` (OWNER: buat, ikat per jenis, ubah + konfirmasi dampak + konflik, ganti
  nama/duplikat, lepas dari sumber, hapus IN_USE, siapa bisa apa, remap versi). Diperbarui: 13 widget-pivot
  (batas 1–8 nilai, 4 tingkat, anggaran sel, Top N, tautan), 08 editor (bagian field terhitung + pivot
  tersimpan), 09 viewer (membaca angka pivot/grafik), 01 mengenal (Versi di menu akun). Label UI dicek ke
  komponen (pivot-config, calc-editor, config-sections, saved-pivots/*, widget-source, bound-config,
  account-menu). Runbook §Isi panduan: perintah seed `--update --only` empat artikel lama T-076.
- AC3: `aitk uat script T-076` lalu ditulis ulang (Indonesia): docs/ai/uat/T-076.md + data contoh
  docs/ai/uat/T-076-contoh.csv (20 baris; angka acuan dihitung dari file) — A Tampilkan sebagai, B field
  terhitung, C 4×8/anggaran sel/Top N, D pivot tersimpan (ikat 4 widget di 2 dashboard, ubah sekali,
  konflik, hapus terlindung, lepas, simpan sebagai, editor/viewer), E versi/panduan/rilis, F tertunda
  (frontend-expert audit T-069/T-070/T-074, upgrade olympus + PDF sungguhan + perf T-075, keputusan target
  dingin T-hfqf). UAT TIDAK diterima agen; menunggu pemilik.
- AC4: rilis `aitk release` (v1.3.0) dijalankan orkestrator di main setelah UAT — tidak dijalankan di task ini.

**Asumsi**
- AC1 "semua task G-7 selesai": T-069/T-070/T-074 (audit frontend-expert) dan T-075 (olympus) masih blocked
  menunggu pemilik; dokumen mencerminkan perilaku kode sekarang dan menyebut yang tertunda.
- Artikel pivot tersimpan berperan OWNER (satu artikel satu peran); editor mendapat ringkasan di artikel
  editor.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya dokumen, isi panduan, dan uji; tidak ada komponen/batas kepercayaan baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah; uji memakai helper akun e2e yang ada tanpa password di repo
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: artikel baru berperan OWNER; e2e guide-content memastikan viewer mendapat 404 untuk satu-pivot-banyak-widget (filter peran T-020 tidak berubah)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: isi panduan lewat parseGuideFile (zod + guideBodyProblem, uji unit) dan dirender rehype-sanitize; tanpa HTML mentah; e2e tabel terender tanpa markdown mentah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan/kunci baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: dokumen, panduan, skrip UAT, dan CSV contoh tanpa rahasia/data pribadi (data contoh fiktif, email pemilik tidak ditulis)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tanpa dependensi atau kode aplikasi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis baru; dokumen menjelaskan batas yang sudah ditegakkan server
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas aplikasi baru (CSV contoh hanya dokumen UAT)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: tidak ada perubahan konfigurasi; runbook hanya menambah perintah seed --only yang tidak menimpa artikel lain
