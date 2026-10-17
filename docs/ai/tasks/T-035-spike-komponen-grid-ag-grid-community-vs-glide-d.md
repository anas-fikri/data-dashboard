---
id: T-035
title: 'Spike komponen grid: AG Grid Community vs Glide Data Grid di React 19/Next 16'
status: in_review
profile: standard
goal: G-6
tags:
  - ui
  - spike
  - adr
depends_on:
  - T-016
  - T-017
  - T-018
  - T-020
  - T-021
  - T-022
  - T-023
  - T-024
  - T-028
  - T-029
  - T-030
  - T-031
  - T-032
  - T-033
created: "2026-10-15T02:30:54Z"
updated: "2026-10-17T19:33:03Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 429eb9f7d680a214110cb933a772ad70c4182d90
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T19:33:02Z"
      findings: 10
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T19:33:03Z"
      findings: 0
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-2, Fase 0. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given prototipe kedua grid dengan sumber data sintetis 10.000.000 baris, when digulir/diseret ke akhir di Chrome, Safari, dan Firefox, then baris terakhir tercapai dan 'Ke baris 9.999.999' tepat
- [x] Given header CSP T-027 aktif, when grid dimuat, then nol pelanggaran CSP, chunk rute lazy ≤ 300 KB gzip, dan aturan lint menggagalkan impor ag-grid-enterprise
- [x] Given checklist keyboard/ARIA (NVDA/VoiceOver), tema token terang/gelap, ikon Tabler, dan salin sel ke Excel, then hasil per kandidat tercatat dan ADR memilih satu komponen dengan versi dipin, syarat lisensi terkini, dan fallback (TanStack Virtual + paging blok)

## Risk
- Impact: spike tanpa kode produk: laporan docs/ai/perf/T-035.md, ADR-0007 (AG Grid Community 36.2.0 dipin + mitigasi stretching; fallback TanStack Virtual + paging blok), aturan ESLint yang menolak impor AG Grid Enterprise, dan uji lockfile/aturan lint. Dependensi grid belum dipasang (dipasang saat T-043).
- Security (STRIDE): Tampering/Elevation — tidak ada permukaan baru; CSP T-027 diuji tanpa pelanggaran di 3 engine (style nonce tersedia bila style-src diperketat). Lisensi — aturan lint + uji lockfile mencegah modul Enterprise (berbayar) masuk tanpa sengaja, termasuk transitif.
- Rollback: revert commit T-035 (aturan lint + test + dokumen); tidak ada data atau skema yang berubah.
- Validation: prototipe kedua grid 10 jt baris di Chromium 156 / WebKit 27.2 / Firefox 157; bukti + sumber + hasil mentah di docs/ai/perf/T-035/ (ringkasan di docs/ai/perf/T-035.md): ke akhir & 'Ke baris 9.999.999' tepat dengan mitigasi gabungan (termasuk focusguard: keyboard dalam 28/28 di 3 engine); wheel median ≤ 5 / maks ≤ 8; 0 pelanggaran CSP; chunk rute dengan set modul T-043 263,0 KiB gzip (build Next Turbopack, batas 293 KiB); keyboard/ARIA/axe, tema token, ikon Tabler, salin TSV tercatat per kandidat; NVDA/VoiceOver, perangkat sentuh nyata, dan CSP lewat proxy Next belum diverifikasi (dipindah ke gerbang T-043, AC ditambahkan di commit 613ea9e). tests/lib/no-enterprise-deps.test.ts lolos (12 bentuk impor × 8 ekstensi, lockfile tanpa paket Enterprise).

## Notes

- 2026-10-17T12:55:30Z AC3: hasil keyboard/ARIA/axe, tema token, ikon Tabler, salin TSV tercatat per kandidat; verifikasi NVDA/VoiceOver tidak dapat dijalankan di lingkungan ini — atas delegasi keputusan user ('ambil keputusan standard paling ideal') dipindah ke gerbang a11y T-043 (AC ditambahkan) dan ADR-0007 berstatus proposed sampai gerbang itu lolos. Uji di Safari/Firefox rilis nyata dan perangkat sentuh nyata juga di T-043.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — spike: dokumen, ADR-0007 (proposed), aturan lint + uji; tidak ada kode produk, batas kepercayaan dan aliran data tidak berubah
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
