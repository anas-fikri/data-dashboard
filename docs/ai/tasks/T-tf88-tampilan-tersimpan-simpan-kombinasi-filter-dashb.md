---
id: T-tf88
title: 'Tampilan tersimpan: simpan kombinasi filter dashboard dengan nama'
status: todo
profile: standard
tags:
  - dashboards
created: "2026-11-10T01:17:13Z"
updated: "2026-11-10T02:59:40Z"
created_by: claude-code
---

## Objective
Pengguna menyimpan kombinasi filter dashboard dengan nama (mis. Jakarta – bulan ini), memilihnya kembali dari menu Tampilan, dan membagikannya lewat link; tampilan pribadi per pengguna, pemilik/editor bisa membuat tampilan bersama untuk semua yang punya akses.

## Acceptance criteria
- [ ] Given filter dashboard aktif, when pengguna memilih Simpan tampilan dan memberi nama, then tampilan tersimpan (pribadi) dan muncul di menu Tampilan dashboard itu
- [ ] Given pemilik/editor, when menyimpan tampilan sebagai bersama, then semua yang punya akses dashboard melihatnya; viewer hanya bisa membuat tampilan pribadi
- [ ] Given tampilan dipilih, when diterapkan, then filter di URL diganti dengan filter tampilan itu (link bisa dibagikan); tampilan bisa diganti nama dan dihapus oleh pembuatnya (bersama: pemilik/editor)
- [ ] Given kolom filter dihapus dari dashboard, when tampilan lama dipilih, then filter untuk kolom yang hilang diabaikan tanpa galat

## Risk
Impact: tampilan tersimpan — migrasi tabel baru DashboardView, service src/features/dashboards/views.ts, route /api/dashboards/[id]/views(/[viewId]) lewat features/dashboards/http.ts, UI filters/saved-views.tsx, applyState/widgetIds di filter-context, parseFilterState di filter-model.
Security (STRIDE): IDOR — daftar/ubah/hapus disaring OR userId/shared + peran (dashboardAccess), syarat akses juga di WHERE penulisan (updateMany/deleteMany); Elevation — tampilan bersama hanya pemilik/editor, pembuat yang bukan editor lagi hanya bisa menjadikan pribadi/hapus; Tampering/DoS — status divalidasi skema ?f= + batas panjang URL, batas 20 per user dan 20 bersama per dashboard (juga saat dijadikan bersama) di bawah advisory lock; CSRF — rejectCrossOrigin + body JSON ≤ 64 KB + rate limit dashboardEdit.
Rollback: revert image ke v1.13.0 aman (tabel baru diabaikan); tidak perlu menurunkan migrasi.
Validation: tests/features/dashboards/views.test.ts (8), e2e dashboard-flex T-tf88, filters/sharing e2e, suite e2e per proyek.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Tabel baru per (dashboard, user); route baru memakai kerangka mutation yang sama (origin, ukuran, rate limit)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — dashboardAccess per permintaan; pribadi orang lain tidak pernah terbaca/tertulis (OR userId/shared di WHERE baca dan tulis); bersama: pemilik/editor
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Nama cleanName ≤ 60; status parseFilterState (skema ?f=, ≤ URL_PARAM_MAX) saat simpan dan dibaca ulang; id isIdShape
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat tak terduga → 503 umum (withUser); pesan bisa ditindak tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Hanya nama + status filter (bukan data dataset); ikut terhapus bersama dashboard/user (cascade)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Batas tampilan per user dan bersama di bawah advisory lock (termasuk pribadi → bersama); nama unik per (dashboard, user)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Body JSON ≤ 64 KB
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Route JSON dengan status kode konsisten (400/403/404/409/429), rate limit dashboardEdit, Origin wajib
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Migrasi hanya menambah tabel (aman untuk rollback image)
