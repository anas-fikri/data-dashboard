---
id: T-019
title: 'Halaman admin pengguna: daftar, admin, nonaktifkan, alihkan kepemilikan'
status: in_progress
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-003
  - T-010
created: "2026-10-11T14:45:09Z"
updated: "2026-10-13T14:00:12Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 2ba4512ea154dcc1cf436b69e0a64bee2f376dec
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 31747
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

      {"level":40,"time":1791899991079,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791899991101,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  34 passed (34)
            Tests  640 passed (640)
         Start at  20:59:48
         Duration  22.38s (tests 89%, import 6%, transform 4%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-13T14:00:12Z"
    tree: c1ef3f9999a3669a874d0fb4ce0397e922c42339e2a958f633ec4df21a3a060a
---

## Objective
/admin/pengguna untuk isAdmin: daftar user (email, admin, aktif, login terakhir), toggle admin, nonaktifkan/aktifkan (menaikkan sessionVersion → sesi putus, D1), alihkan semua dataset user nonaktif ke user lain. Larangan: menonaktifkan diri sendiri atau admin aktif terakhir.

## Acceptance criteria
- [ ] Given admin menonaktifkan user B yang sedang login, when B mengirim permintaan berikutnya, then diarahkan ke /login dengan pesan akun nonaktif dan tidak bisa login lagi
- [ ] Given hanya satu admin aktif, when ia mencoba mencabut admin dirinya atau menonaktifkan dirinya, then code LAST_ADMIN
- [ ] Given user non-admin, when membuka /admin/pengguna atau memanggil Server Action-nya, then 404 / code NOT_FOUND tanpa perubahan
- [ ] Given dataset milik B (nonaktif) dengan dashboard, when admin mengalihkan ke C, then C pemilik dan dashboard tetap berfungsi
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given admin A mencabut peran admin B yang sedang login, when B mengirim permintaan admin berikutnya, then NOT_FOUND (toggle admin menaikkan sessionVersion dan isAdmin dibaca dari DB)
- [ ] Given toggle admin, nonaktifkan, atau alih kepemilikan, when terjadi, then AuditLog tercatat dengan actor, target, dan ip

## Risk
- **Impact:**
  - Model baru AuditLog {actorId?, action, targetType, targetId, meta?, ip, at} (relasi User onDelete SetNull; indeks [targetType, targetId], [actorId], [at]); migrasi 20261013133022_audit_log hanya CREATE TABLE + indeks + FK, tanpa mengubah data. Dipakai ulang T-016/T-017 lewat recordAudit(tx, …) di src/features/audit/service.ts.
  - Modul baru src/features/admin (service, actions, types, transfer-names): listUsers, listTransferTargets, setUserAdmin, setUserActive, transferDatasets + Server Action setUserAdminAction, setUserActiveAction, transferDatasetsAction.
  - Perilaku bersama yang berubah: requireUser("page") kini mengarahkan sesi akun nonaktif ke /login?next=…&reason=disabled (alasan lain tetap /login?next=…); loginUrl(next, reason?) mendapat parameter opsional; getSessionUser dan requireUser("action") tidak berubah. RULES mendapat "admin" (60/menit per admin).
  - Seed: SEED_ADMIN_EMAIL hanya diberi isAdmin/isActive saat akun DIBUAT; seed ulang tidak lagi mengaktifkan/mengangkat akun yang sudah ada (sebelumnya diam-diam membatalkan nonaktif/cabut admin). Memulihkan admin kini lewat admin lain atau SQL manual.
  - Mencabut admin menaikkan sessionVersion target → target keluar dari semua perangkat (AC6); memberi admin TIDAK memutus sesi (isAdmin dibaca dari DB tiap permintaan, jadi langsung berlaku); pelaku yang mencabut perannya sendiri mendapat sesi baru di perangkat ini (selfDemoted, tanpa revalidate — UI yang mengarahkan keluar).
  - Alih kepemilikan memindahkan Dataset.ownerId (dashboard/widget ikut karena tidak punya kolom pemilik); nama bentrok di pemilik baru diberi akhiran " (n)"; unggahan UPLOADING sumber ditandai FAILED dan multipart di-abort setelah commit. Kuota pemilik baru bisa terlampaui (dilaporkan quotaExceeded; unggahan berikutnya ditolak QUOTA_EXCEEDED oleh initUpload).
  - Catatan T-003 (hapus user → objek storage): T-019 tidak menghapus user dan nonaktif tidak menghapus dataset, jadi deleteDatasetObjects tidak dipanggil di sini; tetap berlaku bila penghapusan user ditambahkan kelak.
- **Security (STRIDE):**
  - **Spoofing:** setiap Server Action memanggil requireAdmin("action") lebih dulu (isAdmin, isActive, sessionVersion dari DB); sesi yang sudah dicabut gagal di sana. Pelaku dicek ulang sebagai admin aktif di dalam transaksi di bawah lock 'admins' (peran bisa dicabut admin lain di antara cek dan tulis).
  - **Tampering:**
    - Argumen action divalidasi server: id harus berbentuk cuid (isIdShape) atau NOT_FOUND; flag harus boolean atau INVALID; kata kunci pencarian NFC, tanpa karakter kontrol, ≤ 100, Prisma terparameter.
    - Aturan bisnis di server: admin aktif terakhir tidak bisa dicabut/dinonaktifkan (LAST_ADMIN), menonaktifkan diri sendiri FORBIDDEN, memberi admin ke akun nonaktif/belum verifikasi INVALID, alih hanya dari akun nonaktif ke akun aktif + terverifikasi lain.
  - **Repudiation:** AuditLog (actor, action, target, ip, at) ditulis di transaksi yang sama dengan perubahannya: tidak ada perubahan tanpa jejak. Alih kepemilikan mencatat meta { from, to, moved, datasetIds, renamed, failedUploads }. ip dari clientIp(headers, TRUST_PROXY) ("local" di dev).
  - **Information disclosure:**
    - Non-admin, tanpa sesi, atau sesi dicabut → NOT_FOUND "Halaman tidak ditemukan." (D2) tanpa kueri tulis; halaman /admin/pengguna memakai requireAdmin() → 404.
    - reason=disabled hanya untuk JWT sah milik akun itu (pemegang cookie = pemilik akun) → bukan oracle enumerasi; login tetap hanya mengungkap ACCOUNT_DISABLED setelah password benar.
    - Error tak terduga → BUSY dengan pesan umum; detail hanya di log. Meta audit tanpa email, password, atau token.
  - **DoS:** rate limit "admin" 60/menit per admin (Redis mati → aksi tetap jalan dan dicatat, agar menonaktifkan akun yang disalahgunakan tidak terhalang); listUsers dipaginasi 50; listTransferTargets dibatasi 1000; lock yang habis waktu (P2028) → BUSY.
  - **Elevation of privilege:**
    - Race "dua admin saling mencabut" ditutup pg_advisory_xact_lock(hashtext('admins')) + hitung admin aktif di dalam transaksi.
    - Alih kepemilikan memegang lock 'datasets:<tujuan>' dan 'uploads:<tujuan>' (sama dengan createDataset/initUpload) → batas 50 dataset dan kuota tidak bisa diakali paralel; semua-atau-tidak (rollback bila jumlah yang pindah tidak cocok; P2002 dari ganti nama bersamaan → BUSY).
    - CSRF: Server Actions Next memeriksa Origin bawaan; cookie SameSite=Lax.
- **Rollback:**
  - Revert commit T-019. Migrasi audit_log hanya menambah tabel; aman dibiarkan untuk kode lama. Untuk membuangnya: DROP TABLE "AuditLog" lalu hapus folder migrasi (jejak audit hilang).
  - Dataset yang sudah dialihkan tidak kembali otomatis; meta.datasetIds + meta.renamed di AuditLog cukup untuk mengembalikan pemilik/nama secara manual.
  - Revert seed mengembalikan perilaku lama (seed ulang mengaktifkan/mengangkat SEED_ADMIN_EMAIL).
- **Validation:**
  - tests/features/admin/service.test.ts (Prisma palsu dalam memori dengan rollback): LAST_ADMIN saat cabut/nonaktif diri sendiri, admin nonaktif tidak dihitung, FORBIDDEN nonaktif diri, sessionVersion naik saat cabut/nonaktif dan tetap saat beri/aktifkan, audit actor/target/ip, pelaku yang sudah dicabut → NOT_FOUND, alih: sumber aktif / tujuan tidak sah / tanpa dataset → INVALID, LIMIT_REACHED dengan jumlah yang muat, rename " (n)" termasuk nameKey lama, unggahan → FAILED + abort setelah commit, quotaExceeded, rollback penuh, P2002/P2028 → BUSY, listUsers/listTransferTargets.
  - tests/features/admin/actions.test.ts: non-admin dan sesi dicabut → NOT_FOUND tanpa tulis/rate limit/revalidate, redirect Next dilempar ulang, DB mati → BUSY, RATE_LIMITED, Redis mati, selfDemoted menerbitkan ulang sesi, revalidatePath, ip dari X-Real-IP saat TRUST_PROXY.
  - tests/features/auth/session.test.ts (reason=disabled hanya untuk akun nonaktif dengan JWT sah; mode action tetap AuthError) dan tests/lib/seed.test.ts (seed tidak mengubah akun yang sudah ada).
  - e2e dan audit UI: lihat Notes (Conventions check) setelah halaman selesai.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T23:56:00Z Dari review T-003: Dataset.owner onDelete Cascade → menghapus user menghapus baris dataset tetapi tidak objek storage. Penghapusan/penonaktifan user oleh admin wajib memanggil deleteDatasetObjects per dataset (atau mencatat ke StorageCleanup).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → Server Actions admin (requireAdmin("action"), rate limit) → service admin (cek ulang pelaku + lock 'admins' + AuditLog dalam satu transaksi) → Postgres (User.isAdmin/isActive/sessionVersion, Dataset.ownerId, AuditLog) dan object storage (abort multipart). Data sensitif: peran/status akun dan jejak audit (ip). Dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — Tidak ada kredensial baru. Akun nonaktif tetap ditolak login (ACCOUNT_DISABLED setelah password benar); seed tidak lagi mengaktifkan ulang SEED_ADMIN_EMAIL dan tetap tanpa password bawaan.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — Nonaktif dan cabut admin menaikkan sessionVersion target → semua sesinya ditolak di permintaan berikutnya (cek DB tiap permintaan, D1); aktifkan tidak menghidupkan token lama. Cabut admin diri sendiri menerbitkan ulang sesi perangkat ini lewat createSession (pola changePassword). Diuji unit.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Ketiga Server Action memanggil requireAdmin("action") sebelum apa pun; AuthError (non-admin/tanpa sesi/sesi dicabut) → NOT_FOUND tanpa kueri tulis (diuji). Pelaku dicek ulang di dalam transaksi; isAdmin selalu dari DB. Halaman /admin/pengguna wajib requireAdmin() (404) — dibuktikan e2e UI.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id lewat isIdShape, flag harus boolean, kata kunci pencarian NFC tanpa karakter kontrol ≤ 100; semua kueri Prisma terparameter; advisory lock lewat $executeRaw tagged template. Nama hasil rename dibangun dari nama yang sudah tervalidasi, ≤ 80 karakter, nameKey dihitung ulang dengan nameKeyOf. Output dirender React.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan (AuditLog tanpa kredensial/token).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode tetap (NOT_FOUND/LAST_ADMIN/FORBIDDEN/INVALID/RATE_LIMITED/LIMIT_REACHED/BUSY) dengan pesan Indonesia; error tak terduga → BUSY dengan pesan umum, detail di log pino. Peristiwa keamanan (beri/cabut admin, nonaktif/aktif, alih) tercatat di AuditLog + log terstruktur tanpa rahasia.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Daftar pengguna hanya memilih kolom yang ditampilkan (tanpa passwordHash/sessionVersion); meta audit tanpa email; actorId SetNull bila akun pelaku dihapus. Halaman dinamis per permintaan (cookie), tidak di-cache.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (abort multipart memakai klien S3 yang ada).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tidak ada dependensi baru; tidak ada jalur pintas admin (seed tidak lagi mengangkat ulang akun).
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Admin aktif terakhir dilindungi di bawah lock 'admins' (dua admin saling mencabut tidak bisa menghasilkan nol admin); alih kepemilikan semua-atau-tidak di bawah lock 'datasets:<tujuan>' + 'uploads:<tujuan>' dengan batas 50 dataset; aksi tanpa perubahan tidak menulis/mengaudit. Diuji unit.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Tidak ada unggahan baru; unggahan sumber yang belum selesai ditandai FAILED dan multipart di-abort/dihapus memakai sourceKey dari DB (bukan input klien).
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Hanya Server Actions (Origin dicek Next); argumen divalidasi bentuknya di service; rate limit "admin" 60/menit per admin (fail-open bila Redis mati, disengaja dan dicatat).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi atau dependensi baru; seed kini aman secara bawaan (tidak membatalkan keputusan admin).
