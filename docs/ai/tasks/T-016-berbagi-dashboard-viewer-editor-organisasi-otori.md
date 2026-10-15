---
id: T-016
title: 'Berbagi dashboard: viewer/editor, organisasi, otorisasi query berbasis widget'
status: in_review
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-012
created: "2026-10-11T14:45:09Z"
updated: "2026-10-15T14:02:14Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 94df0a4153bf645653471d49852b3eb78591ced8
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-15T03:39:10Z"
      findings: 11
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-15T05:03:51Z"
      findings: 8
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-15T06:43:41Z"
      findings: 8
    - "n": 4
      by: claude-verify-workflow
      at: "2026-10-15T08:18:46Z"
      findings: 9
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-15T09:59:30Z"
      findings: 7
    - "n": 6
      by: claude-verify-workflow
      at: "2026-10-15T12:57:33Z"
      findings: 4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 40609
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792072913395,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792072913419,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  88 passed (88)
            Tests  1342 passed (1342)
         Start at  21:01:47
         Duration  25.50s (tests 79%, import 14%, transform 7%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-15T14:02:14Z"
    tree: 109b05af08d1c692197290869af7da77c47b4a3a21a9743e6c78ee8b44a4e0f3
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
Impact: semua jalur baca/tulis dashboard (halaman, widget query, filter-values, Server Action widget/layout, getDashboardSources, daftar /dashboards) berpindah dari cek inline `dataset.ownerId` ke satu fungsi `dashboardAccess` → regresi di satu tempat bisa membuka data ke user lain atau mengunci pemilik. Migrasi baru: tabel DashboardShare + kolom Dashboard.orgShared (default false, aditif). Hapus dataset kini menulis audit dalam transaksi yang sama.
Security (STRIDE): S — sesi wajib aktif+terverifikasi (requireUser), grantee hanya user aktif terverifikasi, bukan diri sendiri. T — penulisan widget/layout oleh editor tetap di dalam transaksi advisory lock dengan cek akses di dalamnya (tanpa TOCTOU); filterColumns, rename/hapus dashboard, share tetap pemilik. R — AuditLog dashboard.share.grant/role/revoke, dashboard.org.share, dashboard.open (dedup 30 menit), dataset.delete. I — akses per dashboard, bukan per dataset; mode bebas /api/query hanya pemilik (non-pemilik 404); viewer dapat pesan umum COLUMN_UNAVAILABLE tanpa nama kolom tersembunyi/lama; cached/ms disembunyikan; filter D6 tetap (400); pencarian user dibatasi prefix ≥3, maks 10, rate limit; peringatan editor & kolom filter lintas sheet di dialog share. D — rate limit baru RULES.share + pencarian user; query widget memakai batas yang ada. E — editor tidak bisa mengubah kolom filter/share/hapus; viewer tidak punya jalur tulis (FORBIDDEN/403); akses tidak di-cache sehingga pencabutan berlaku pada muatan berikutnya.
Rollback: revert commit T-016 + `prisma migrate` turun manual (DROP TABLE "DashboardShare", DROP TYPE "DashboardRole", ALTER TABLE "Dashboard" DROP COLUMN "orgShared") — data share hilang, dashboard pemilik tidak terpengaruh; baris AuditLog tetap.
Validation: unit test dashboardAccess (owner/editor/viewer/org/none, dashboard lain dataset sama 404), Server Action FORBIDDEN vs NOT_FOUND, /api/query mode bebas 404 untuk non-pemilik, mode {dashboardId, spec} lintas dataset 404, filter kolom tak diizinkan 400, audit per aksi; e2e B viewer/C org/pencabutan mid-session/editor; review adversarial berulang sampai 0 temuan; axe + render 320/768/1024/1440; next build.

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
