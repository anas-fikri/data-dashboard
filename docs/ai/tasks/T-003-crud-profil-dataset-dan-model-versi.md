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
updated: "2026-10-11T23:56:00Z"
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
evidence:
  audit:
    at: "2026-10-11T23:54:34Z"
    passed: true
    tree: bd466ef1506e0eaaf817e63dd3a953445ef5f20cb5744b62c6b6342929c91928
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 604 packages
          End status: 76 dirs visited, 288 inodes visited, 1 Extract calls, 38.70275ms elapsed, 38.704ms wall time
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
- [ ] Given user login, when membuat profil dataset dengan nama unik per pemilik, then profil muncul di daftar dengan label kosong
- [ ] Given profil milik user lain yang tidak dibagikan, when user membuka URL-nya langsung atau memanggil Server Action-nya, then halaman 404 / code NOT_FOUND dan tidak ada perubahan
- [ ] Given profil dengan versi READY aktif dan versi terbaru FAILED, when membuka daftar, then label siap dengan badge gagal beserta pesan
- [ ] Given profil dataset, when user menghapus dengan konfirmasi dua langkah, then profil, versi, dan dashboard terkait hilang dan hook penghapusan storage serta pembatalan job terpanggil (diverifikasi test)
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

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
