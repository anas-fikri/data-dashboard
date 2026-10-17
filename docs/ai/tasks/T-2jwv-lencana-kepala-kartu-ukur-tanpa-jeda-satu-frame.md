---
id: T-2jwv
title: 'Lencana kepala kartu: ukur tanpa jeda satu frame dan tidak merebut ruang tombol yang disembunyikan CSS'
status: todo
profile: standard
depends_on:
  - T-7ke3
created: "2026-10-17T10:37:19Z"
updated: "2026-10-17T11:17:18Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: frontend-expert-design-reviewer
      at: "2026-10-17T11:17:15Z"
      findings: 4
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-17T11:17:16Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given kartu grafik melewati ambang container query tombol data saat diubah ukurannya, when lencana diukur ulang, then tidak ada frame dengan judul < 4rem (pengukuran sebelum paint)
- [x] Given tombol kepala disembunyikan CSS di pita sempit, when ruang lencana dihitung, then lencana tidak muncul hanya di pita 2 px lalu hilang lagi (tidak berkedip saat resize)
- [x] Given aturan headRoom (elemen absolut/tersembunyi dilewati, elemen fleksibel dihitung min-width, mode bungkus), when diuji unit dengan tata letak tiruan, then setiap aturan teruji

## Risk
- Impact: kepala kartu grafik dashboard: lencana kategori diukur di layout effect dan callback ResizeObserver dengan flushSync (keputusan ter-commit sebelum paint, tanpa frame lencana basi); tombol kepala yang disembunyikan container query (data-head-control: pegangan, tombol data, ekspor) membuat lencana mengalah. Hanya tampilan klien; data, query, izin tidak berubah. Keputusan produk: di pita sempit tablet sentuh lencana tidak tampil.
- Security (STRIDE): N/A — tidak ada input, endpoint, atau data baru; atribut data-head-control hanya penanda tata letak; lencana tetap aria-hidden + title. DoS klien: flushSync hanya merender bila mode lencana berubah (nilai sama → bail out); banyak kartu melewati ambang bersamaan = beberapa render sinkron kecil (dicatat di T-qrxf).
- Rollback: revert commit T-2jwv → kembali ke pengukuran rAF T-7ke3 (satu frame basi saat melewati ambang, lencana "pulau" di pita sempit edit).
- Validation: vitest badge-fit 9/9 (aturan headRoom dengan tata letak tiruan: judul/lencana tidak dihitung, absolut/tersembunyi dilewati, fleksibel min-width, kontrol tersembunyi → ruang 0, mode bungkus); e2e chart-polish 8/8 dengan sampler per frame (rAF, lewati frame yang pengukurannya masih tertunda) — validasi negatif: pola rAF lama gagal (frame judul 19 px di 1024 px), kode baru lolos; invarian tanpa lencana selama kontrol tersembunyi; design review 2 putaran.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan tampilan klien saja; batas kepercayaan dan aliran data tidak berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak ada endpoint/aksi baru; data yang ditampilkan berasal dari query widget yang sudah diotorisasi
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — teks lencana dirender React (di-escape otomatis), berasal dari angka hasil hitung, bukan HTML mentah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data baru yang ditampilkan atau disimpan
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tampilan saja
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada perubahan API
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru; kelas Tailwind dari token yang ada
