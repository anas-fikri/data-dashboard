---
id: T-003
title: CRUD profil dataset dan model versi
status: in_review
profile: strict
profile_pinned: true
goal: G-2
tags:
  - security
depends_on:
  - T-002
  - T-025
created: "2026-10-11T14:45:08Z"
updated: "2026-10-12T01:11:09Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 66ba1d540b833c62b2ba8641dd7196ab53ff8fbb
review:
  passes:
    - "n": 1
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:56:00Z"
      findings: 2
    - "n": 2
      by: claude-security-reviewer-subagen
      at: "2026-10-11T23:58:30Z"
      findings: 0
    - "n": 3
      by: frontend-expert-design-reviewer
      at: "2026-10-11T23:58:30Z"
      findings: 11
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-12T01:08:55Z"
      findings: 2
    - "n": 5
      by: frontend-expert-design-reviewer
      at: "2026-10-12T01:10:52Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 6857
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

      {"level":40,"time":1791767467827,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791767467848,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  9 passed (9)
            Tests  63 passed (63)
         Start at  08:11:07
         Duration  567ms (tests 38%, transform 30%, import 30%, worker 2%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-12T01:11:09Z"
    tree: c6f1b73b2b9593e4a91b6efa8d3d78dca9438f2b933e8e7e7ad4500256c46e0e
  audit:
    at: "2026-10-12T01:07:45Z"
    passed: true
    tree: 70331b7d2b7f7e6661b6d9dd9282c06ab1e07e4511bf089c1af19d880b42c25d
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 604 packages
          End status: 77 dirs visited, 292 inodes visited, 1 Extract calls, 44.603625ms elapsed, 44.604ms wall time
          Loaded npm local db from /Users/anasfikri/Library/Caches/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Model Dataset {name, description, ownerId, activeVersionId?} dan DatasetVersion {status: UPLOADING|UPLOADED|INGESTING|AWAITING_MAPPING|READY|FAILED, mode: REPLACE|APPEND, sourceKey, etag, sha256?, errorMessage?, ingestFinishedAt?}. Label profil diturunkan (kosong/siap + badge versi terbaru), bukan kolom (B5). Daftar hanya milik user atau yang dibagikan. Hapus = konfirmasi dua langkah; memanggil hook storage.deleteDatasetObjects (diimplementasikan penuh di T-004) dan queue.cancelVersionJobs.

## Acceptance criteria
- [x] Given user login, when membuat profil dataset dengan nama unik per pemilik, then profil muncul di daftar dengan label kosong
- [x] Given profil milik user lain yang tidak dibagikan, when user membuka URL-nya langsung atau memanggil Server Action-nya, then halaman 404 / code NOT_FOUND dan tidak ada perubahan
- [x] Given profil dengan versi READY aktif dan versi terbaru FAILED, when membuka daftar, then label siap dengan badge gagal beserta pesan
- [x] Given profil dataset, when user menghapus dengan konfirmasi dua langkah, then profil, versi, dan dashboard terkait hilang dan hook penghapusan storage serta pembatalan job terpanggil (diverifikasi test)
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
Risk level: MEDIUM-HIGH (model data inti + hapus kaskade: salah filter = kebocoran/kehilangan data antar user)
Impact surface: prisma (Dataset, DatasetVersion, Dashboard minimal untuk kaskade; enum status/mode), src/features/datasets/* (service, label, actions), src/lib/storage/objects.ts (hapus per prefix), src/lib/queue/versions.ts (pembatalan job, stub sampai BullMQ di T-006), halaman /datasets, /datasets/baru, /datasets/[id].
Security (STRIDE): Elevation/IDOR — setiap baca/ubah/hapus memakai where {id, ownerId: user.id}; tidak ada → NOT_FOUND/404 (D2), tidak membedakan 'tidak ada' dan 'bukan milik'. Tampering — hapus dua langkah dengan konfirmasi nama yang dicek server; input nama 1–80, deskripsi ≤ 500, di-trim. DoS — batas 50 dataset per user (LIMIT_REACHED). Information disclosure — label/badge hanya untuk pemilik; pesan error versi ditampilkan apa adanya ke pemilik (berasal dari worker, bukan input user lain).
Compatibility: Dashboard minimal (id, datasetId, name, layout) dibuat sekarang agar kaskade hapus teruji; T-010 menambah kolom. Status versi sesuai B5 (enum English, label UI Indonesia). activeVersionId relasi SetNull.
Failure modes/edge cases: nama duplikat per pemilik (case-insensitive, pakai nameKey) → NAME_TAKEN; hapus saat storage error → transaksi DB tetap jalan? Urutan: batalkan job → hapus DB (kaskade) → hapus objek storage best-effort dengan log (objek yatim dibersihkan job T-013/T-023); prefix storage selalu diakhiri '/'; id cuid validasi bentuk sebelum query.
Rollback: revert commit + migrasi drop tabel (belum ada data produksi).
Validation: unit deriveLabel (semua status), validasi input, deleteDataset memanggil hook storage + queue (deps diinjeksi); e2e: buat → daftar label kosong; nama duplikat ditolak; user lain → 404 halaman + NOT_FOUND action (replay); versi READY aktif + FAILED terbaru (skrip seed dev) → 'Siap' + badge gagal + pesan; hapus dua langkah → hilang dari daftar, versi/dashboard terhapus; batas 50; audit desain frontend-expert.
Open risks/assumptions: berbagi (T-016) belum ada → daftar hanya milik sendiri.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Hapus prefix storage selalu dengan '/' penutup (parquet/<datasetId>/) agar cuid berawalan sama tidak ikut terhapus. Batas 50 dataset per user (code LIMIT_REACHED).
- 2026-10-12T01:10:59Z Conventions check (audit frontend-expert pass 5, commit 29f1080: 0 Critical/High/Medium/Low). Tokens: preset project T-025 (zinc-blue, success/destructive/warning/primary tints, tanpa warna hardcode). Icons: waiver @tabler/icons-react (IconPlus, IconCircleCheck, IconCircleDashed, IconAlertTriangle, IconLoader2, IconUpload, IconRoute, IconFileSpreadsheet, IconTrash, IconChevronRight, IconLayoutDashboard), outline, size 20/stroke 1.5 default. States: loading (pending tombol form + dialog), empty (EmptyState daftar/beranda/kartu Data), error (FormAlert field + alert unggahan gagal dengan nama file + langkah), success (FocusNotice dibuat/dihapus menerima fokus). Responsive: 320/768/1024/1440 tanpa overflow, daftar @container (tabel @3xl, kartu di bawahnya), CTA w-full di ponsel. A11y: axe 0 pelanggaran di 34 pemeriksaan terang/gelap, ul>li>a dengan label sr-only, satu h1, fokus dialog ke input konfirmasi. Sisa kosmetik (bukan temuan): ruang bawah 20px di kartu Beranda, rapikan saat menyentuh Beranda lagi.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — diverifikasi: batas kepercayaan = Server Action/halaman → service (ownerId dari sesi, bukan input); storage dan antrean dipanggil hanya dari service
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; semua rute dataset di balik requireUser
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi; memakai requireUser dengan cek sessionVersion
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: setiap baca/ubah/hapus where {id, ownerId}; user lain → 404 halaman dan NOT_FOUND action (e2e replay IDOR)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: nama 1–80, deskripsi ≤ 500, tolak karakter kontrol/format; bentuk id divalidasi sebelum query; query Prisma terparameter (advisory lock via tagged template); output di-escape React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: P2028 → BUSY, unique → NAME_TAKEN, tanpa stack ke klien; log hanya datasetId; error storage dicatat tanpa kredensial
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: hapus dataset menghapus versi, dashboard, dan objek storage; prefix gagal dicatat ke StorageCleanup untuk dibersihkan ulang
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (storage internal, TLS produksi diatur T-023)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; npm audit dan aitk audit hijau
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: batas 50 dataset di bawah pg_advisory_xact_lock per pemilik (e2e 5 replay paralel → tetap 50); hapus wajib konfirmasi nama dicek server; urutan batal job → hapus DB → hapus storage (unit)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: belum ada upload (T-004); prefix storage selalu berakhiran '/' agar cuid berawalan sama tidak ikut terhapus
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: Server Action memvalidasi input di server; Origin asing ditolak Next (e2e T-027); tidak ada API publik baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — diverifikasi: tanpa konfigurasi debug baru; skrip fixture dev menolak NODE_ENV=production
