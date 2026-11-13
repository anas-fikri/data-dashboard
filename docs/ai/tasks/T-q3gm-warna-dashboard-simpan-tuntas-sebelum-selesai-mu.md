---
id: T-q3gm
title: 'Warna dashboard: simpan tuntas sebelum Selesai/muat ulang + nilai server terkini (Low review T-z1vv)'
status: in_review
profile: standard
created: "2026-11-06T23:41:10Z"
updated: "2026-11-13T15:50:02Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 25abf41eb4f653703b46230443af0fe93a698013
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T15:47:39Z"
      findings: 2
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T15:48:29Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-13T15:48:50Z"
      findings: 0
---

## Objective
Temuan Low review putaran 2 T-z1vv (dashboard-colors-control.tsx / dashboard-canvas.tsx):
L1 "Selesai" (done() di dashboard-canvas) tidak menunggu simpan template warna (jeda 350 ms + request) — mode lihat bisa memuat template lama sampai dimuat ulang; kontrol perlu mengekspos flush yang ditunggu sebelum router.push.
L2 tutup tab/F5/"Muat ulang" (window.location.reload) tidak menjalankan cleanup React → perubahan ≤ 350 ms terakhir hilang; kirim di pagehide, dan antrekan keepalive di belakang chain agar nilai lama tidak menang.
L3 ref `confirmed` hanya diisi saat mount: setelah kanvas mengikuti perubahan rekan, gagal simpan kembali ke nilai saat mount; refresh server bisa menimpa pilihan yang belum tersimpan (tampilan salah, data benar).

## Acceptance criteria
- [x] Selesai dan Muat ulang menunggu simpan warna dashboard yang tertunda sebelum pindah/memuat ulang (mode lihat memakai template terbaru)
- [x] Tutup tab/F5 sebelum jeda habis tetap mengirim pilihan terakhir (pagehide + keepalive)
- [x] Gagal simpan kembali ke nilai server terkini (termasuk perubahan rekan), bukan nilai saat panel dipasang; nilai server tidak menimpa pilihan yang belum tersimpan

## Risk
Impact: kontrol Warna dashboard + tombol Selesai/Muat ulang di mode edit dashboard. Security: N/A (endpoint sama). Rollback: versi sebelumnya. Validation: e2e status-colors + chart-theme; aitk check.

## Notes

- 2026-11-13T15:45:50Z Keterbatasan: keepalive saat pagehide tidak bisa diantrekan di belakang permintaan yang sedang berjalan (halaman sudah ditutup) — urutan di server bisa terbalik bila keduanya tiba bersamaan (sangat jarang).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — klien saja (urutan simpan warna), endpoint & otorisasi tidak berubah
