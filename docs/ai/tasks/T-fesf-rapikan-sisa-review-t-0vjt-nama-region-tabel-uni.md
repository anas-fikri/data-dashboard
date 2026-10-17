---
id: T-fesf
title: 'Rapikan sisa review T-0vjt: nama region tabel unik, batas kolom di luar blok kode, status artikel atomik'
status: todo
profile: standard
depends_on:
  - T-0vjt
created: "2026-10-17T10:31:26Z"
updated: "2026-10-17T11:27:26Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:27:24Z"
      findings: 4
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:27:24Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given artikel dengan dua tabel (atau dua blok kode) berjudul kolom sama, when dirender, then setiap region punya nama unik (axe landmark-unique lolos)
- [x] Given baris '| --- |' dengan 9+ kolom di dalam blok kode berpagar, when artikel disimpan, then tidak ditolak sebagai tabel terlalu lebar; tabel sungguhan 9+ kolom tetap ditolak
- [x] Given artikel dihapus atau diubah bersamaan dengan terbit/tarik, when setGuideStatus berjalan, then hasilnya NOT_FOUND untuk baris yang hilang dan audit memakai slug/peran hasil UPDATE yang sama
- [x] Given sesi dicabut, when membuka /panduan atau /admin/panduan, then dialihkan ke /login (gerbang layout (daftar) teruji)

## Risk
- Impact: render markdown panduan (nama wilayah gulir tabel/blok kode unik per artikel lewat plugin rehype sesudah sanitasi), validasi isi artikel (baris di dalam blok kode berpagar tingkat atas tidak lagi diperiksa sebagai tabel/kutipan), setGuideStatus (UPDATE dulu lalu baca slug/peran di transaksi yang sama; baris hilang → NOT_FOUND), e2e gerbang sesi dicabut untuk /panduan dan /admin/panduan.
- Security (STRIDE): DoS — pelacak pagar sengaja lebih ketat daripada CommonMark: hanya pagar di kolom 0 (tingkat atas, tanpa kontainer yang bisa menutupnya implisit) dan info string backtick tanpa backtick; pagar menjorok tetap diperiksa sehingga batas 8 kolom tidak bisa diakali. Repudiation — slug/peran audit terbit/tarik dibaca sesudah UPDATE (baris terkunci), konsisten dengan baris yang diubah. Elevation — gerbang layout (daftar) kini teruji e2e (sesi dicabut → /login). XSS — nama wilayah di-escape React; properti dataRegion ditambahkan sesudah sanitasi dan tidak dirender sebagai atribut.
- Rollback: revert commit T-fesf (tanpa migrasi); kembali ke nama wilayah ganda, contoh tabel lebar di blok kode ditolak, dan setGuideStatus mengembalikan sukses untuk baris yang hilang bersamaan.
- Validation: vitest markdown (nama unik 3 tabel + 2 blok kode; pagar sah tidak ditolak; bukan pagar/pagar menjorok tetap ditolak), service (NOT_FOUND saat dihapus bersamaan, urutan update→baca, meta dari baca sesudah UPDATE); e2e auth 12/12 (sesi dicabut → /login untuk /panduan dan /admin/panduan), guides + guide-content 8/8.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tetap: isi artikel (input admin) → guideBodyProblem (simpan + sebelum render) → remark (remarkNoHtml, remarkTable + batas kolom) → rehype-sanitize → rehypeRegionNames → React
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; e2e baru memastikan sesi dicabut → 307 ke /login di gerbang layout (daftar)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi (pencabutan lewat sessionVersion yang ada diuji e2e)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — gerbang requireUser/requireAdmin di layout (daftar) kini teruji di level server (307, bukan pengalihan klien); setGuideStatus tetap admin-only lewat actions
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — pelacak pagar gagal tertutup (BOM dibuang, hanya pagar kolom 0 dilacak, baris mirip pagar lain mematikan pengecualian), kedalaman diperiksa di semua baris; nama wilayah di-escape React; properti dataRegion ditambahkan sesudah sanitasi dan tidak dirender sebagai atribut
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — tabel terlalu lebar saat render diganti teks yang jelas, bukan galat; validasi simpan memberi pesan Indonesia yang bisa ditindak
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — audit terbit/tarik tetap {slug, role} tanpa isi artikel, kini dibaca dari baris yang sama dengan UPDATE
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit + osv-scanner 0 temuan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — setGuideStatus: UPDATE dulu (baris terkunci) lalu baca slug/peran; baris hilang bersamaan → NOT_FOUND, status sama → ok tanpa audit ganda
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — DoS render dibatasi berlapis: batas 8 kolom saat simpan + penjaga mdast sebelum toHast (2.500 kolom × 1.990 baris dicegat < 1,5 s); reviewer fuzz ±1,17 juta dokumen tanpa celah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
