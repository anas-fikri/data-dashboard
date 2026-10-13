---
id: T-019
title: 'Halaman admin pengguna: daftar, admin, nonaktifkan, alihkan kepemilikan'
status: in_review
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
updated: "2026-10-13T16:39:08Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 2ba4512ea154dcc1cf436b69e0a64bee2f376dec
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-13T14:32:41Z"
      findings: 19
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-13T15:34:02Z"
      findings: 9
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-13T16:21:30Z"
      findings: 4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 34012
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

      {"level":40,"time":1791909525694,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791909525716,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  37 passed (37)
            Tests  673 passed (673)
         Start at  23:38:42
         Duration  24.45s (tests 89%, import 6%, transform 5%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-13T16:39:08Z"
    tree: 4fc6bb42e6ad4e9737a3be306ad1f4883fc098fb5895a847d79a102494a6ab3e
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
  - Modul baru src/features/admin (service, actions, types, transfer-names): listUsers (kata kunci + saring status all/active/inactive/unverified), searchTransferTargets, setUserAdmin, setUserActive, transferDatasets + Server Action setUserAdminAction, setUserActiveAction, transferDatasetsAction, searchTransferTargetsAction (cari calon pemilik baru di server, ≤ 20 per ketikan; halaman tidak lagi memuat daftar tujuan di depan).
  - Modul baru src/lib/text.ts (cleanLine/cleanName, looksLikeEmail, escapeLike), dipakai registrasi dan semua jalur baca admin.
  - Registrasi (T-002, src/features/auth/service.ts): nama dibersihkan dari \p{Cc}\p{Cf} (termasuk bidi U+202A–202E, U+2066–2069), spasi dirapikan, maks 80 code point; nama yang memuat @ ditolak dengan kode baru INVALID_NAME (pesan form-level; /api/auth/login memetakan kode itu ke 400 agar peta status tetap lengkap). Nama dari token lama ikut dibersihkan saat aktivasi.
  - Log keamanan: requireAdmin("page") mencatat penolakan non-admin (warn "akses halaman admin ditolak" { userId, path tanpa query }); AuthError membawa userId untuk log aksi.
  - scripts/dev-purge-test-data.mjs (global teardown e2e) kini juga menghapus akun buatan uniqueEmail setelah datasetnya dibersihkan; akun lain tidak disentuh. scripts/admin-restore.mjs baru untuk memulihkan admin terakhir.
  - Perilaku bersama yang berubah: requireUser("page") kini mengarahkan sesi akun nonaktif ke /login?next=…&reason=disabled (alasan lain tetap /login?next=…); loginUrl(next, reason?) mendapat parameter opsional; getSessionUser dan requireUser("action") tidak berubah. RULES mendapat "admin" (60/menit per admin).
  - Seed: SEED_ADMIN_EMAIL hanya diberi isAdmin/isActive saat akun DIBUAT; seed ulang tidak lagi mengaktifkan/mengangkat akun yang sudah ada (sebelumnya diam-diam membatalkan nonaktif/cabut admin). Memulihkan admin kini lewat admin lain, atau bila tidak ada admin yang bisa masuk lewat scripts/admin-restore.mjs <email> (--confirm wajib di produksi; menulis AuditLog user.admin.restore, actorId null, ip "cli"; runbook di README "Memulihkan admin terakhir").
  - Mencabut admin menaikkan sessionVersion target → target keluar dari semua perangkat (AC6); memberi admin TIDAK memutus sesi (isAdmin dibaca dari DB tiap permintaan, jadi langsung berlaku); pelaku yang mencabut perannya sendiri mendapat sesi baru di perangkat ini (selfDemoted, tanpa revalidate — UI yang mengarahkan keluar).
  - Alih kepemilikan memindahkan Dataset.ownerId (dashboard/widget ikut karena tidak punya kolom pemilik); hanya dataset yang namanya benar-benar bentrok (dengan milik pemilik baru atau dataset masuk lain) diberi akhiran " (n)" terkecil yang belum terpakai — dua putaran, deterministik, nama yang tetap dipakai dataset lain tidak pernah diambil; unggahan UPLOADING sumber ditandai FAILED dan multipart di-abort setelah commit. Kuota pemilik baru bisa penuh/terlampaui (quotaExceeded bila pemakaian ≥ kuota; unggahan berikutnya ditolak QUOTA_EXCEEDED oleh initUpload). Tujuan yang sudah 50 dataset → LIMIT_REACHED "Pengguna tujuan sudah memiliki batas maksimal 50 dataset."
  - Catatan T-003 (hapus user → objek storage): T-019 tidak menghapus user dan nonaktif tidak menghapus dataset, jadi deleteDatasetObjects tidak dipanggil di sini; tetap berlaku bila penghapusan user ditambahkan kelak.
- **Security (STRIDE):**
  - **Spoofing:**
    - Setiap Server Action memanggil requireAdmin("action") lebih dulu (isAdmin, isActive, sessionVersion dari DB); sesi yang sudah dicabut gagal di sana. Pelaku dicek ulang sebagai admin aktif di dalam transaksi di bawah lock 'admins' (peran bisa dicabut admin lain di antara cek dan tulis).
    - Nama tampilan tidak bisa menyamar sebagai email pengguna lain: registrasi membuang karakter kontrol/format (termasuk RLO U+202E dan isolat bidi) dan menolak nama yang memuat @; listUsers dan searchTransferTargets membersihkan nama yang sama untuk data lama; UI menampilkan email lebih dulu (identitas utama) dan tombol konfirmasi alih menyebut email tujuan.
  - **Tampering:**
    - Argumen action divalidasi server: id harus berbentuk cuid (isIdShape) atau NOT_FOUND; flag harus boolean atau INVALID; kata kunci pencarian NFC, tanpa karakter kontrol, ≤ 100, wildcard LIKE (`\`, `%`, `_`) di-escape (q="_" tidak lagi cocok dengan semua pengguna), Prisma terparameter; status di luar daftar → "all".
    - Aturan bisnis di server: admin aktif terakhir tidak bisa dicabut/dinonaktifkan (LAST_ADMIN), menonaktifkan diri sendiri FORBIDDEN, memberi admin ke akun nonaktif/belum verifikasi INVALID, alih hanya dari akun nonaktif ke akun aktif + terverifikasi lain.
  - **Repudiation:** AuditLog (actor, action, target, ip, at) ditulis di transaksi yang sama dengan perubahannya: tidak ada perubahan tanpa jejak. Alih kepemilikan mencatat meta { from, to, moved, datasetIds, renamed: [{ datasetId, from, to }], failedUploads }. ip dari clientIp(headers, TRUST_PROXY) ("local" di dev); keaslian ip (dan cek Origin Server Action) di produksi bergantung pada reverse proxy yang MENIMPA Host/X-Forwarded-Host/X-Real-IP — kewajiban konfigurasi itu milik T-023 (sudah dicatat di Notes T-023), bukan T-019. Pemulihan admin lewat CLI juga diaudit (user.admin.restore).
  - **Information disclosure:**
    - Non-admin, tanpa sesi, atau sesi dicabut → NOT_FOUND "Halaman tidak ditemukan." (D2) tanpa kueri tulis; halaman /admin/pengguna memakai requireAdmin() → 404.
    - reason=disabled hanya untuk JWT sah milik akun itu (pemegang cookie = pemilik akun) → bukan oracle enumerasi; login tetap hanya mengungkap ACCOUNT_DISABLED setelah password benar.
    - Error tak terduga → BUSY dengan pesan umum; detail hanya di log. Meta audit tanpa email, password, atau token.
    - Penolakan akses dicatat tanpa membocorkan apa pun ke klien: aksi → warn "aksi admin ditolak" { userId bila ada sesi, code, action } (termasuk pelaku yang dicabut di antara requireAdmin dan lock); halaman → warn "akses halaman admin ditolak"; LAST_ADMIN/FORBIDDEN/RATE_LIMITED → info "aksi admin ditolak aturan".
  - **DoS:** rate limit "admin" 60/menit per admin (Redis mati → aksi tetap jalan dan dicatat, agar menonaktifkan akun yang disalahgunakan tidak terhalang); listUsers dipaginasi 50; calon pemilik baru dicari di server (searchTransferTargetsAction, ≤ 20 hasil per kata kunci, hanya admin; tanpa jatah rate limit perubahan karena hanya baca) — tidak ada lagi daftar 1000 yang dipotong diam-diam; lock yang habis waktu (P2028) → BUSY.
  - **Elevation of privilege:**
    - Race "dua admin saling mencabut" ditutup pg_advisory_xact_lock(hashtext('admins')) + hitung admin aktif di dalam transaksi.
    - Alih kepemilikan memegang lock 'datasets:<tujuan>' dan 'uploads:<tujuan>' (sama dengan createDataset/initUpload) → batas 50 dataset dan kuota tidak bisa diakali paralel; semua-atau-tidak (rollback bila jumlah yang pindah tidak cocok; P2002 dari ganti nama bersamaan → BUSY).
    - CSRF: Server Actions Next memeriksa Origin bawaan; cookie SameSite=Lax.
- **Rollback:**
  - Revert commit T-019. Migrasi audit_log hanya menambah tabel; aman dibiarkan untuk kode lama. Untuk membuangnya: DROP TABLE "AuditLog" lalu hapus folder migrasi (jejak audit hilang).
  - Dataset yang sudah dialihkan tidak kembali otomatis. Pengembalian manual memakai meta AuditLog: meta.datasetIds untuk pemilik (ownerId kembali ke meta.from), meta.renamed[].datasetId + from untuk nama (dicocokkan per id, bukan per nama, jadi tetap benar meski nama sudah diganti lagi; nameKey dihitung ulang dengan nameKeyOf).
  - Revert seed mengembalikan perilaku lama (seed ulang mengaktifkan/mengangkat SEED_ADMIN_EMAIL).
- **Validation:**
  - tests/features/admin/service.test.ts (Prisma palsu dalam memori dengan rollback): LAST_ADMIN saat cabut/nonaktif diri sendiri, admin nonaktif tidak dihitung, FORBIDDEN nonaktif diri, sessionVersion naik saat cabut/nonaktif dan tetap saat beri/aktifkan, audit actor/target/ip, pelaku yang sudah dicabut → NOT_FOUND, alih: sumber aktif / tujuan tidak sah / tanpa dataset → INVALID, LIMIT_REACHED dengan jumlah yang muat, rename " (n)" termasuk nameKey lama, unggahan → FAILED + abort setelah commit, quotaExceeded, rollback penuh, P2002/P2028 → BUSY, listUsers/listTransferTargets.
  - tests/features/admin/actions.test.ts: non-admin dan sesi dicabut → NOT_FOUND tanpa tulis/rate limit/revalidate, redirect Next dilempar ulang, DB mati → BUSY, RATE_LIMITED, Redis mati, selfDemoted menerbitkan ulang sesi, revalidatePath, ip dari X-Real-IP saat TRUST_PROXY.
  - tests/features/auth/session.test.ts (reason=disabled hanya untuk akun nonaktif dengan JWT sah; mode action tetap AuthError) dan tests/lib/seed.test.ts (seed tidak mengubah akun yang sudah ada).
  - Perbaikan review putaran 1 (backend):
    - Spoofing nama: tests/lib/text.test.ts (RLO/isolat/ZW/soft hyphen dibuang, spasi dirapikan, NFC, potong per code point, deteksi @ termasuk lebar penuh) dan tests/features/auth/register.test.ts (nama berbentuk email → INVALID_NAME tanpa menulis/rate limit; nama dibersihkan sebelum disimpan di token); service.test.ts: nama data lama dibersihkan di listUsers dan searchTransferTargets.
    - Log penolakan: actions.test.ts (warn dengan userId/code/action untuk NOT_FOUND dan UNAUTHENTICATED, info untuk LAST_ADMIN dan FORBIDDEN), service.test.ts (pelaku dicabut di bawah lock → warn), session.test.ts (requireAdmin halaman → warn dengan path tanpa query; admin tidak dicatat; AuthError membawa userId).
    - Rename berantai: service.test.ts "rencana nama: rantai" ([X, X (2)] → tujuan [X] menjadi X (3) + X (2) tetap; [Data, Data (2), DATA (3)]; tabrakan antar dataset masuk; deterministik dan tanpa nama ganda) + transferDatasets end-to-end di Prisma palsu dengan meta.renamed ber-datasetId.
    - Low integritas: escape LIKE (unit + diverifikasi di Postgres dev: contains `_` = semua akun, `\_` = 0), quotaExceeded saat pemakaian = kuota, LIMIT_REACHED saat tujuan 50 dataset ("batas maksimal", bukan "hanya 0 lagi").
    - Saring status: service.test.ts (where per status, status tak dikenal → all, nonaktif urut jumlah dataset terbanyak, digabung dengan kata kunci).
    - Pencarian tujuan: service.test.ts + actions.test.ts (aktif + terverifikasi selain sumber, ≤ 20, q kosong → 20 pertama, id rusak → NOT_FOUND, non-admin → NOT_FOUND tanpa kueri, tidak memakai rate limit).
    - Pemulihan admin: scripts/admin-restore.mjs diuji manual di DB dev (tanpa email → exit 2; NODE_ENV=production tanpa --confirm → ditolak; email tidak ada → tanpa perubahan; akun uji terverifikasi → aktif + admin + AuditLog user.admin.restore ip cli).
    - Kebersihan dev: purge dijalankan 2026-10-13 → 913 akun uji dihapus (970 → 57 pengguna, admin aktif 46 → 3, calon tujuan 951 → 51); akun selain pola uniqueEmail (admin@, demo.admin@, audit-*, design-*, fixui19-*) tidak disentuh.
    - e2e: `npx playwright test tests/e2e/admin.spec.ts --project=admin --no-deps --reporter=line` 2026-10-13 di atas HEAD 467b44d + perubahan kerja (belum di-commit) → 5 passed (AC1, AC3, AC4 lewat pencarian server + tombol "Alihkan ke <email>", AC6, AC7); teardown: {"testUsers":39,"datasets":1,"objects":3,"accounts":4}.
  - Perbaikan review putaran 2 (backend), 2026-10-13:
    - Volume log penolakan: tests/features/auth/denial-log.test.ts (5 warn pertama per pengguna/anon + aksi per jendela 1 menit, lalu satu ringkasan "<n> penolakan ditekan" setelah jendela; jatah terpisah per pengguna/aksi/anon; Redis mati → setiap penolakan tetap dicatat; Redis putus sebelum ringkasan → ringkasan tanpa jumlah). actions.test.ts dan session.test.ts: penolakan aksi/halaman lewat logAccessDenied (halaman memakai satu jatah "page", bukan per path). Live di dev: non-admin 20× searchTransferTargets paralel + 8× GET /admin/pengguna → 5 + 5 warn, lalu "aksi admin ditolak: 15 penolakan ditekan" dan "akses halaman admin ditolak: 3 penolakan ditekan"; respons tetap NOT_FOUND / 404.
    - Nama ber-@ dari token lama: register.test.ts (verifyEmail tidak memasang "a@b.com" / @ lebar penuh, nama biasa tetap dibersihkan; resendVerification menyalin pendingName null).
    - Saringan "Belum verifikasi" = aktif + belum verifikasi: service.test.ts (where per status + tiap kombinasi aktif/nonaktif × verifikasi masuk tepat satu saringan). DB dev: semua 90 = aktif 53 + nonaktif 37 + belum verifikasi 0.
    - admin-restore.mjs diuji manual di DB dev: DATABASE_URL host db.internal / URL rusak tanpa --confirm → ditolak exit 1; NODE_ENV=production → ditolak; akun uji nonaktif terverifikasi → aktif + admin, sessionVersion 1 → 2, AuditLog meta {wasAdmin, wasActive, osUser, host}; dijalankan ulang → "sudah admin aktif", exit 0, sessionVersion tetap 2, tetap satu baris AuditLog. Akun uji dihapus setelahnya.
    - dev-purge-test-data.mjs --dry-run: jumlah akun = akun uniqueEmail yang tidak punya dataset selain yang akan dihapus (filter yang sama dengan jalur sungguhan); dijalankan → {"testUsers":36,"datasets":0,"objects":0,"accounts":1} (akun uji restore di atas).
  - e2e dan audit UI: lihat Notes (Conventions check) setelah halaman selesai.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T23:56:00Z Dari review T-003: Dataset.owner onDelete Cascade → menghapus user menghapus baris dataset tetapi tidak objek storage. Penghapusan/penonaktifan user oleh admin wajib memanggil deleteDatasetObjects per dataset (atau mencatat ke StorageCleanup).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → Server Actions admin (requireAdmin("action"), rate limit) → service admin (cek ulang pelaku + lock 'admins' + AuditLog dalam satu transaksi) → Postgres (User.isAdmin/isActive/sessionVersion, Dataset.ownerId, AuditLog) dan object storage (abort multipart). Data sensitif: peran/status akun dan jejak audit (ip). Dirinci di Risk.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — Tidak ada kredensial baru. Akun nonaktif tetap ditolak login (ACCOUNT_DISABLED setelah password benar); seed tidak lagi mengaktifkan ulang SEED_ADMIN_EMAIL dan tetap tanpa password bawaan.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — Nonaktif dan cabut admin menaikkan sessionVersion target → semua sesinya ditolak di permintaan berikutnya (cek DB tiap permintaan, D1); aktifkan tidak menghidupkan token lama. Cabut admin diri sendiri menerbitkan ulang sesi perangkat ini lewat createSession (pola changePassword). Diuji unit.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Keempat Server Action (termasuk searchTransferTargetsAction yang hanya baca) memanggil requireAdmin("action") sebelum apa pun; AuthError (non-admin/tanpa sesi/sesi dicabut) → NOT_FOUND tanpa kueri apa pun dan dicatat (diuji). Pelaku dicek ulang di dalam transaksi; isAdmin selalu dari DB. Halaman /admin/pengguna wajib requireAdmin() (404) — dibuktikan e2e UI (AC3/AC6, run 2026-10-13 di Validation).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id lewat isIdShape, flag harus boolean, kata kunci pencarian NFC tanpa karakter kontrol ≤ 100 dengan wildcard LIKE di-escape; nama pengguna dibersihkan dari karakter kontrol/bidi saat registrasi dan saat dibaca, nama berbentuk email ditolak; semua kueri Prisma terparameter; advisory lock lewat $executeRaw tagged template. Nama hasil rename dibangun dari nama yang sudah tervalidasi, ≤ 80 karakter, nameKey dihitung ulang dengan nameKeyOf. Output dirender React.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan (AuditLog tanpa kredensial/token).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Kode tetap (NOT_FOUND/LAST_ADMIN/FORBIDDEN/INVALID/RATE_LIMITED/LIMIT_REACHED/BUSY) dengan pesan Indonesia; error tak terduga → BUSY dengan pesan umum, detail di log pino. Peristiwa keamanan (beri/cabut admin, nonaktif/aktif, alih, pemulihan admin lewat CLI) tercatat di AuditLog + log terstruktur tanpa rahasia. Keputusan akses yang gagal juga dicatat (ASVS V7.2.2): Server Action admin → warn "aksi admin ditolak" { userId bila ada sesi, code, action }, halaman /admin/* → warn "akses halaman admin ditolak" { userId, path tanpa query }, penolakan aturan LAST_ADMIN/FORBIDDEN/RATE_LIMITED → info. Diuji unit. Penolakan akses admin (aksi dan halaman) dicatat warn dengan userId/kode/aksi, dibatasi 5 per pengguna per aksi per menit lewat Redis (sisanya satu baris ringkasan 'N penolakan ditekan'; fail-open bila Redis mati).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Daftar pengguna hanya memilih kolom yang ditampilkan (tanpa passwordHash/sessionVersion); meta audit tanpa email; actorId SetNull bila akun pelaku dihapus. Halaman dinamis per permintaan (cookie), tidak di-cache.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (abort multipart memakai klien S3 yang ada).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tidak ada dependensi baru; tidak ada jalur pintas admin (seed tidak lagi mengangkat ulang akun).
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Admin aktif terakhir dilindungi di bawah lock 'admins' (dua admin saling mencabut tidak bisa menghasilkan nol admin); alih kepemilikan semua-atau-tidak di bawah lock 'datasets:<tujuan>' + 'uploads:<tujuan>' dengan batas 50 dataset; aksi tanpa perubahan tidak menulis/mengaudit. Diuji unit dengan Prisma palsu (lock hanya dicatat, tidak disimulasikan); race-nya dibuktikan reviewer keamanan putaran 1 terhadap PostgreSQL scratch dengan service asli (saling cabut 15/15 menyisakan 1 admin, transfer vs createDataset/transfer 10/10 tepat 50 dataset). Tes regresi integrasi di repo masih tindak lanjut.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Tidak ada unggahan baru; unggahan sumber yang belum selesai ditandai FAILED dan multipart di-abort/dihapus memakai sourceKey dari DB (bukan input klien).
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Hanya Server Actions (Origin dicek Next); argumen divalidasi bentuknya di service; rate limit "admin" 60/menit per admin untuk aksi yang mengubah data (fail-open bila Redis mati, disengaja dan dicatat); pencarian calon pemilik sengaja tanpa jatah itu (hanya baca, admin saja, ≤ 20 hasil) agar mengetik tidak menghabiskan jatah perubahan.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Tidak ada konfigurasi atau dependensi baru; seed kini aman secara bawaan (tidak membatalkan keputusan admin).
