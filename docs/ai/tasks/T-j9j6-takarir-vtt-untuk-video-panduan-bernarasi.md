---
id: T-j9j6
title: Takarir (VTT) untuk video panduan bernarasi
status: in_review
profile: standard
depends_on:
  - T-021
created: "2026-10-16T21:34:35Z"
updated: "2026-10-17T11:19:08Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: e4ef7a6510c0222a7805f07a4582696d82aed8f6
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:11:26Z"
      findings: 10
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:11:26Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 26838
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      [warn] src/features/ingest/xlsx-parallel.ts
      [warn] src/lib/xlsx/sheet-worker.ts
      [warn] Code style issues found in 2 files. Run Prettier with --write to fix.
    at: "2026-10-17T11:19:08Z"
    tree: a3bf207ce2bb54a48f46a1bf2ee1b0f44ac0cd42ab5d60ad25d98a182bba9a6b
  check_failures: 2
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given admin mengunggah file .vtt untuk sebuah video, when divalidasi (signature WEBVTT, ≤ 200 KB, Content-Type text/vtt dari server), then pemutar di /panduan menampilkan tombol takarir dan teks tampil sinkron
- [x] Given file .vtt tidak valid atau > 200 KB, when diunggah, then ditolak INVALID_FORMAT / FILE_TOO_LARGE dan video tetap tanpa takarir

## Risk
- Impact: video panduan bisa diberi takarir WebVTT: kolom baru GuideVideo.captionKey (migrasi ADD COLUMN nullable, tanpa default — metadata saja di PostgreSQL 14), objek guides/captions/<id>.vtt, route POST/GET /api/guides/videos/[id]/takarir, <track> di pemutar (/panduan, panel bantuan, editor), kontrol "Tambah/Ganti takarir" di editor. Hapus video/artikel ikut menjadwalkan + menghapus objek takarir; job storage-cleanup mengenali kunci takarir.
- Security (STRIDE): Tampering/XSS — signature WEBVTT + UTF-8 sah + tanpa NUL diperiksa server, Content-Type objek & respons ditetapkan server (text/vtt; charset=utf-8) + nosniff; isi cue dirender mesin takarir browser, tidak pernah ke DOM aplikasi. Information disclosure — GET memakai aturan akses yang sama dengan videoSource (READY; non-admin hanya artikel terbit sesuai peran), tanpa takarir/tak boleh/id buruk semuanya 404; Cache-Control private, no-cache; same-origin (tanpa CORS) sehingga situs lain tidak bisa memakai sebagai <track>. Elevation — POST admin-only (selain itu 404), cek Origin sama, rate limit uploadSign. DoS — body dibatasi 200 KB (readBytesLimited), GET tanpa rate limit khusus (sama dengan /sumber; biaya 1 query + ≤ 200 KB). Path traversal — id divalidasi cuid, kunci dibangun server dan dicek pola ketat di setiap operasi storage.
- Rollback: revert commit T-j9j6; kolom captionKey boleh dibiarkan (nullable, tidak dibaca kode lama) atau dibuang dengan migrasi DROP COLUMN; objek guides/captions/* yang tersisa tidak terjangkau (kode lama menolak kunci takarir) — hapus manual bila perlu.
- Validation: vitest media (isVtt, captionProblem), videos-cleanup (setVideoCaption sah/tidak sah/terlalu besar/race hapus, 3 kunci dijadwalkan + dihapus), video-source (akses videoCaptionKey), cleanup (pola kunci takarir), video-player (track hanya bila bertakarir, URL berversi); e2e guide-videos 7/7 (ditolak INVALID_FORMAT & FILE_TOO_LARGE, non-admin 404, ganti takarir mengubah URL track tanpa muat ulang, header text/vtt + nosniff + private, cue aktif sinkron di detik ke-5); review 2 putaran.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: editor admin → POST /takarir (sesi admin, same-origin) → storage; pembaca → GET /takarir (sesi, aturan akses halaman) → storage internal → respons same-origin. Storage tidak diekspos untuk takarir (tanpa presigned)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: memakai requireUser yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — POST: admin saja, selain itu 404; GET: visibleVideo (READY; non-admin artikel PUBLISHED sesuai peran + ALL), tanpa takarir / tidak boleh / id buruk → 404 yang sama (tanpa oracle)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — isVtt: UTF-8 fatal decode (BOM boleh), awalan WEBVTT + spasi/baris baru/EOF, tanpa NUL; id cuid; kunci guides/captions/<cuid>.vtt dicek pola ketat; respons text/vtt; charset=utf-8 + nosniff
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat storage dilog terstruktur (userId, tanpa isi file); user menerima pesan umum 503; pesan validasi bahasa Indonesia yang bisa ditindak
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — takarir berisi teks panduan (bukan data pribadi); Cache-Control private, no-cache; objek ikut terhapus saat video/artikel dihapus (jadwal StorageCleanup dalam transaksi)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: memakai TLS proxy yang ada; tidak ada panggilan keluar baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit + osv-scanner 0 temuan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — video dihapus selagi takarir diunggah → updateMany READY guard, objek baru dibuang (atau dijadwalkan ulang); ganti takarir menimpa kunci yang sama (tanpa yatim); rate limit unggah per admin
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — ≤ 200 KB dibatasi saat membaca body (readBytesLimited) dan di service; tipe ditentukan dari isi (signature), bukan ekstensi/Content-Type klien; kunci dari server, tanpa path traversal
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — POST/GET JSON galat {ok, code, message} dengan status 401/403/404/413/422/429/503; GET mengembalikan text/vtt; same-origin tanpa CORS
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — migrasi ADD COLUMN nullable; CSP media-src 'self' mengizinkan <track> same-origin; tidak ada header/konfigurasi baru selain nosniff per respons
