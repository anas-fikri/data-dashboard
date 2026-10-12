---
id: T-010
title: 'Kanvas dashboard builder: grid, drag/resize, autosave layout'
status: in_review
profile: standard
goal: G-4
depends_on:
  - T-003
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T14:27:51Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 13b3d0b81229d28544cf5d428adf24673f64cb5e
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-12T14:27:51Z"
      findings: 2
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-12T14:27:51Z"
      findings: 6
---

## Objective
Model Dashboard {datasetId, name, layout JSON} dan Widget {dashboardId, type, spec JSON, position}. Grid 12 kolom (react-grid-layout), drag/resize, mode edit vs lihat, undo satu langkah, autosave. Maks 10 dashboard per dataset. UI via plugin frontend-expert.

## Acceptance criteria
- [ ] Given dashboard baru, when user menambah widget kosong lalu menggeser dan mengubah ukurannya, then posisi dan ukuran identik setelah halaman dimuat ulang
- [ ] Given mode lihat, when user mencoba drag widget, then widget tidak bergerak dan panel konfigurasi tidak ada
- [ ] Given lebar layar < 768 px, when membuka dashboard, then widget tersusun satu kolom tanpa scroll horizontal
- [ ] Given dataset sudah punya 10 dashboard, when membuat yang ke-11, then ditolak code LIMIT_REACHED
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- **Impact:**
  - Model baru Widget; Dashboard mendapat nameKey (unik per dataset), layoutRevision, relasi widgets.
  - Migrasi 20261012133500_dashboard_widgets mengisi nameKey untuk dashboard lama (nama kembar diberi akhiran " (n)").
  - Halaman baru /dashboards, /dashboards/baru, /dashboards/[id] (lihat/edit).
  - API baru: POST /api/dashboards/[id]/widgets, PATCH/DELETE /api/dashboards/[id]/widgets/[widgetId], PUT /api/dashboards/[id]/layout.
  - Komponen bersama yang berubah: PageHeader (tumpuk + CTA full-width sampai 767 px, sebelumnya 639 px), helper src/lib/api-route.ts (dipakai ulang oleh rute skema).
  - Dependensi baru react-grid-layout 2.2.4 (dipin).
- **Security (STRIDE):**
  - **Spoofing:** semua rute dan action memakai sesi server; tanpa sesi → 401.
  - **Tampering:**
    - Tata letak divalidasi zod strict: id cuid unik, x + w ≤ 12, h ≤ 40, y ≤ 2000, ≤ 50 widget.
    - Server selalu memadatkan layout sebelum menyimpan.
    - Tambah, hapus, dan simpan otomatis wajib membawa baseRevision di bawah advisory lock per dashboard: tab yang tertinggal → STALE, tidak pernah menimpa.
    - Nama dinormalisasi NFC; karakter kontrol/format ditolak (kecuali ZWJ/ZWNJ) dan wajib ada karakter terlihat.
  - **Repudiation:** perubahan tata letak tidak diaudit per langkah (bukan data sensitif); kegagalan rute dicatat terstruktur dengan label rute.
  - **Information disclosure:**
    - Dashboard/widget selalu di-resolve lewat dataset.ownerId; milik orang lain → 404 (tanpa oracle).
    - Respons no-store; error tak terduga → 503 tanpa detail.
  - **DoS:**
    - Rate limit dashboardEdit 600 per 10 menit per user.
    - Body JSON ≤ 64 KB.
    - Batas 10 dashboard per dataset dan 50 widget per dashboard dihitung di bawah lock (paralel tidak menembus).
    - Lock yang habis waktu → BUSY (409), bukan 500.
  - **Elevation:** CSRF — mutasi wajib Origin = APP_URL (403); Server Actions Next memeriksa Origin bawaan.
- **Rollback:**
  - Revert commit T-010.
  - Migrasi menambah tabel Widget dan kolom Dashboard; aman dibiarkan untuk kode lama. Kode lama tidak menulis nameKey, jadi revert kode tanpa revert skema memerlukan default nameKey — revert bersama migrasi bila perlu (dashboard belum dipakai produksi).
- **Validation:**
  - Unit: tests/features/dashboards/dashboards.test.ts (batas, nama, lock + revisi, STALE, pemadatan, NOT_FOUND saat dashboard hilang) dan tests/components/layout-ops.test.ts (geser/ubah ukuran tanpa seret, tepi grid).
  - e2e: tests/e2e/dashboards.spec.ts — AC 1–4, urungkan, lembar pengaturan < 1280 px dengan fokus masuk/kembali, fokus setelah hapus, STALE lintas tab.
  - Migrasi diuji di database sementara (nama kembar → akhiran, nameKey NOT NULL).
  - axe WCAG 2.2 AA + best-practice: 42 kombinasi (375/768/1024/1280/1440 × terang/gelap × daftar/lihat/edit/edit+panel, plus form buat), 0 pelanggaran, overflow 0.

## Notes

- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → Server Actions (buat/ganti nama/hapus dashboard) dan rute /api/dashboards/[id]/... (sesi server) → service dashboards (cek pemilik lewat dataset.ownerId) → Postgres (Dashboard.layout/layoutRevision, Widget). Tidak ada data pribadi baru; dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; memakai sesi yang ada (requireUser).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Setiap query dashboard/widget memakai where dataset.ownerId = user; widget juga dibatasi dashboardId. Bukan pemilik atau id tidak dikenal → 404 (tanpa membedakan). Diuji unit (NOT_FOUND) dan e2e.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Input lewat zod strict (layout), isIdShape (id), cleanName (NFC, tanpa kontrol/format, wajib terlihat, ≤ 80). Prisma terparameter; advisory lock memakai Prisma.sql tagged template. Output dirender React (escape bawaan).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode error tetap (INVALID/NOT_FOUND/LIMIT_REACHED/NAME_TAKEN/STALE/BUSY) dengan pesan Indonesia; error tak terduga → 503 tanpa detail, dicatat dengan label rute tanpa body.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: dashboard hanya berisi nama dan tata letak; respons no-store; dashboard terhapus bersama widget (cascade).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Dependensi baru react-grid-layout 2.2.4 (dipin, MIT, npm audit 0 kerentanan); tidak ada panggilan jaringan tersembunyi.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Batas 10 dashboard/dataset dan 50 widget/dashboard dihitung di bawah advisory lock; semua perubahan kanvas di bawah lock per dashboard dengan revisi wajib (STALE, tidak menimpa); urungkan satu langkah lewat API yang sama. Diuji unit + e2e lintas tab.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan atau akses berkas di task ini.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Rute JSON: Origin wajib = APP_URL, body ≤ 64 KB, skema zod, rate limit 600/10 menit per user, Cache-Control no-store; DELETE membawa baseRevision lewat query bernilai angka.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi baru; header keamanan dan CSP dari T-001 tetap (e2e security-headers lulus).
