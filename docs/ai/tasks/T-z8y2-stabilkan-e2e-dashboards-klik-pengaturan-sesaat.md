---
id: T-z8y2
title: 'Stabilkan e2e dashboards: klik Pengaturan sesaat setelah muat halaman tidak membuka panel'
status: in_progress
profile: standard
created: "2026-10-21T12:34:25Z"
updated: "2026-10-21T19:58:06Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 460a7f3f8f0b75ad6f002443dedc6daa9d219f3b
---

## Objective
Ditemukan saat T-1zdf (sudah gagal di HEAD 8ce72cf, 2/2 run): di tests/e2e/dashboards.spec.ts tes "urungkan satu langkah dan ubah posisi tanpa menyeret" (dan kadang "< 1280 px: pengaturan sebagai lembar") mengeklik tombol Pengaturan widget langsung setelah page.goto; panel tidak terbuka (heading "Pengaturan widget" tidak ada). Dengan jeda 3 dtk sebelum klik tes lulus — kemungkinan klik sebelum hydration selesai atau saat grid menata ulang lebar (1280 px bawaan → lebar kanvas). Cari akar masalahnya: bila aplikasi mengabaikan klik pengguna sungguhan di jendela itu, perbaiki aplikasinya; bila hanya tes, tunggu sinyal yang benar (bukan waitForTimeout).

## Acceptance criteria
- [x] Given dashboards.spec.ts dijalankan utuh dua kali berturut-turut, then semua 11 tes lulus tanpa jeda waktu buatan (waitForTimeout)

## Risk
Impact: atribut DOM `data-hydrated` di akar kanvas dashboard (dipasang effect setelah hidrasi) + helper
uji; tidak ada perubahan perilaku pengguna.
Security (STRIDE): N/A — atribut penanda tanpa data.
Rollback: revert commit.
Validation: dashboards.spec.ts utuh 2× berturut-turut 11/11 lulus; spec lama (tanpa menunggu hidrasi)
gagal 2/2 pada tes "urungkan satu langkah" (fokus heading panel tidak pernah terjadi).

## Notes
- Akar masalah (T-075, 2026-10-21): kanvas dirender server; tombol Pengaturan kartu sudah terlihat sebelum
  handler React terpasang (dev server Turbopack ± 1–3 s untuk memuat chunk klien). Klik di jendela itu
  hilang — bawaan SSR React, bukan bug logika panel; di build produksi jendelanya jauh lebih singkat.
- Perbaikan: akar kanvas (`data-testid="dashboard-canvas"`) mendapat `data-hydrated` dari effect pertama;
  dashboards.spec.ts membuka mode edit lewat `openEdit` yang menunggu atribut itu (tanpa waitForTimeout).
  Spec lain yang memakai pola coba-ulang (`toPass`) bisa beralih ke penanda yang sama nanti.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
