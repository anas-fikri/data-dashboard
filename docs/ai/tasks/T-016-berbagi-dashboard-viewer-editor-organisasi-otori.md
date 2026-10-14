---
id: T-016
title: 'Berbagi dashboard: viewer/editor, organisasi, otorisasi query berbasis widget'
status: todo
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-012
created: "2026-10-11T14:45:09Z"
updated: "2026-10-14T02:01:59Z"
created_by: claude-code
---

## Objective
Share {dashboardId, userId? | wholeOrg, role: VIEWER|EDITOR}. Organisasi = semua user aktif instance. Pemilik dataset mengelola akses. Non-pemilik hanya boleh /api/query {widgetId, dashboardFilters} dengan filter terbatas kolom yang diizinkan dashboard (D6: kolom filter pilihan pemilik + dimensi grafik cross-filter; berlaku hanya pada kolom bernama sama dengan kelompok tipe sama, `filters` posisional sudah dihapus di T-012); mode bebas ditolak. Editor boleh mengubah widget/layout; viewer tidak. Audit log akses dasar (siapa membuka dashboard apa, kapan).

## Acceptance criteria
- [ ] Given dashboard dibagikan VIEWER ke user B, when B membuka, then B melihat dan memfilter; tombol edit tidak ada; Server Action edit mengembalikan code FORBIDDEN; /api/query mode bebas dari B menjawab HTTP 404
- [ ] Given dashboard pribadi, when user C membuka URL-nya, then 404; given dashboard dibagikan ke organisasi, when C membuka, then berhasil
- [ ] Given B viewer mengirim filter pada kolom yang tidak diizinkan dashboard, when /api/query, then HTTP 400
- [ ] Given pemilik mencabut akses organisasi, when user lain yang sedang membuka memuat data berikutnya, then 404 dan audit log mencatat akses sebelumnya
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given editor dashboard A (dataset X), when mengirim {dashboardId: A, spec} dengan sheetId dataset Y, then HTTP 404; given spec sheet dataset X, then berhasil, dan dialog share menampilkan peringatan 'editor dapat membaca semua kolom tidak tersembunyi dataset ini'
- [ ] Given grant/revoke share, hapus dataset, atau pembukaan dashboard, when terjadi, then baris AuditLog {actorId, action, targetType, targetId, meta, ip, at} tercatat

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Model AuditLog dibuat di sini dan dipakai T-017, T-019.
- 2026-10-13T03:15:56Z Dari verifikasi keamanan T-011: pesan COLUMN_UNAVAILABLE setelah data diganti menyebut nama kolom lama (features/widgets/remap.ts missingMessage) dan pesan kolom tersembunyi menyebut nama kolomnya (query/widget.ts). Saat ini hanya pemilik yang bisa memanggil query widget. Untuk viewer/editor bersama: jangan sebut nama kolom tersembunyi/lama ke viewer — pakai pesan umum 'Kolom yang dipakai widget ini tidak tersedia' kecuali peminta adalah pemilik/editor.
- 2026-10-14T02:01:59Z Dari review keamanan T-012 putaran 2: jalur viewer = /api/query {widgetId, dashboardFilters} (filters posisional dihapus; body strict → 400). Filter dashboard berlaku pada kolom tidak tersembunyi bernama sama DAN sekelompok tipe (teks | angka | waktu | boolean) di sheet mana pun yang dipakai widget dashboard itu, bukan hanya sheet kolom sumber; pemilik yang memilih kolom filter. Dialog share wajib menampilkan peringatan: 'Filter dashboard juga menyaring kolom bernama sama di sheet lain dataset ini; viewer bisa membandingkan hasil widget sheet itu dengan nilai filter' — tampilkan daftar nama kolom filter yang ada di lebih dari satu sheet (tipe sama) agar pemilik bisa mengganti nama atau menghapus kolom filternya sebelum berbagi.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
