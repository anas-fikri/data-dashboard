---
id: T-qrxf
title: 'Kepala kartu: ukur ulang lencana saat jenis pointer/font berubah dan batasi render sinkron'
status: todo
profile: standard
depends_on:
  - T-2jwv
created: "2026-10-17T11:16:27Z"
updated: "2026-10-17T12:36:18Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: frontend-expert-design-reviewer
      at: "2026-10-17T12:36:16Z"
      findings: 7
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-17T12:36:16Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given pointer berubah (any-pointer coarse ↔ fine) atau font web selesai dimuat tanpa kartu berubah ukuran, when lencana tampil, then judul tetap ≥ 4rem (lencana diukur ulang)
- [x] Given ±50 kartu grafik melewati ambang lebar bersamaan (buka/tutup bilah samping), when lencana diukur ulang, then render sinkron hanya menyentuh komponen lencana (bukan seluruh isi kartu) dan tidak ada galat 'ResizeObserver loop'

## Risk
- Impact: kepala kartu grafik dashboard: komponen baru HeadBadge memegang span ukur + dua bentuk lencana; bentuk yang tampil diterapkan langsung ke DOM (hidden + data-testid) di layout effect dan callback ResizeObserver — tanpa render React di callback; observer juga mengamati tombol kepala (data-head-control, termasuk pengaturan) dan span ukur sehingga perubahan jenis pointer (32 ↔ 44 px) dan font yang selesai dimuat memicu ukur ulang. WidgetCard tidak lagi memegang state lencana. Hanya tampilan klien.
- Security (STRIDE): N/A — tidak ada input, endpoint, atau data baru; lencana tetap aria-hidden + title; span tersembunyi keluar dari pohon aksesibilitas. DoS klien: tanpa render React saat resize; penulisan DOM hanya bila berubah.
- Rollback: revert commit T-qrxf → kembali ke state lencana di WidgetCard dengan flushSync (T-2jwv), tanpa ukur ulang saat pointer/font berubah.
- Validation: vitest badge-fit 9/9; e2e chart-polish 9/9 (dua kali berturut-turut tanpa galat ResizeObserver loop), termasuk uji baru: tombol kepala melebar dan lencana melebar (letter-spacing, meniru font) tanpa kartu berubah ukuran → judul ≥ 64 px dan mode lencana berubah (kontrol positif untuk kedua penyebab), galat ResizeObserver loop = 0; design review 2 putaran (7 → 0).

## Notes

- 2026-10-17T12:36:17Z AC2: fixture e2e 4 widget; klaim ±50 kartu (render hanya lencana, tanpa galat ResizeObserver loop) bersandar pada desain — callback observer tidak merender React sama sekali, hanya hidden + data-testid pada dua span (ditulis bila berubah); diverifikasi review desain.

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
