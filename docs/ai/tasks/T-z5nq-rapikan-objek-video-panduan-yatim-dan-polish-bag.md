---
id: T-z5nq
title: Rapikan objek video panduan yatim dan polish bagian Video
status: in_review
profile: standard
depends_on:
  - T-021
created: "2026-10-16T21:53:58Z"
updated: "2026-10-17T10:22:39Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 12eb0a4aa739672cfe401be2053bdb2ae1d2c91f
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T10:15:38Z"
      findings: 5
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T10:15:38Z"
      findings: 0
evidence:
  audit:
    at: "2026-10-17T10:22:27Z"
    passed: true
    tree: 18017c6eef9692bec00bc21bce24e1d6b040541d75fee38c6a0fe050584b5e6c
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 821 packages
          End status: 189 dirs visited, 1108 inodes visited, 1 Extract calls, 106.908709ms elapsed, 106.911ms wall time
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
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given penghapusan objek video/poster gagal di storage, when video atau artikel dihapus, then kunci dicatat ke StorageCleanup dan dibersihkan ulang oleh job pembersihan (tidak ada objek yatim permanen); poster yang diunggah bersamaan dengan hapus video juga terhapus
- [x] Given halaman Panduan dibiarkan terbuka > 1 jam, when pengguna memutar atau melompat di video, then URL video diperbarui tanpa memuat ulang halaman
- [x] Given editor artikel di 768–1023 px, when ada dua video atau lebih, then grid video mengikuti lebar kontainer (bukan viewport), judul bagian tidak terpecah oleh EmptyState, pesan hasil lama hilang setelah aksi berikutnya, dan nama file panjang bisa dibaca utuh

## Risk
- Impact: penghapusan video/artikel panduan dan job storage-cleanup (cabang kunci panduan persis), pemutar video Panduan (sumber baru > 55 menit, satu ambil-ulang per 5 menit saat galat), form unggah video (batas di awal, pesan lama dibersihkan). Data dataset tidak tersentuh: cabang raw/parquet job tetap memakai hapus per prefix.
- Security (STRIDE): Tampering/DoS — job hanya menghapus kunci berbentuk guides/videos/<cuid>.(mp4|webm) atau guides/posters/<cuid>.png lewat deleteGuideObject (validasi format) + abortMultipartFor (menolak kunci berakhiran "/"), tidak pernah per prefix; hanya bila baris GuideVideo sudah tidak ada. Information disclosure — /api/guides/videos/[id]/sumber memakai aturan akses halaman (admin: video READY; lainnya: artikel terbit sesuai peran), id bukan cuid/tak terlihat → 404, tanpa sesi → 401; URL presigned tetap 1 jam. DoS klien — ambil-ulang saat galat dibatasi sekali per 5 menit.
- Rollback: revert commit T-z5nq; baris StorageCleanup "guide-video" yang tersisa aman (job lama tidak mengenali kunci panduan → baris dibuang sebagai prefix tidak sah tanpa menyentuh storage).
- Validation: vitest (cleanup.test deps bawaan + kunci persis, videos-cleanup.test jadwal dalam transaksi, video-source.test, video-upload.test) 866 lolos; e2e guide-videos 6/6 termasuk jam dimajukan 61 menit; aitk check lolos; review 2 putaran (5 → 0 temuan).

## Notes

- 2026-10-16T22:02:08Z Dari review T-021 putaran 2 (non-blocking): (1) Medium a11y — saat admin mengetik di kolom lain, pesan 'Video … tersimpan.' tidak difokus dan wilayah status dikosongkan bersamaan → pembaca layar bisa tidak mengumumkan; isi wilayah status dengan pesan akhir (video-upload.tsx). (2) Low UX — di 5 video form tetap bisa memilih/membaca file sebelum ditolak saat init; tampilkan batas di awal.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: browser → /api/guides/videos/[id]/sumber (sesi) → presign S3; worker job storage-cleanup → storage. Kunci objek panduan hanya diturunkan dari id cuid di server
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi; route baru memakai requireUser yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — /sumber: tanpa sesi 401; admin hanya video READY; selain admin filter artikel PUBLISHED + peran (guideRolesFor) di query; id bukan cuid/tak terlihat → 404 (bukan 403). Hapus video/artikel tetap admin-only (ownVideo/requireAdmin)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id divalidasi cuidSchema sebelum query; prefix StorageCleanup divalidasi regex GUIDE_KEY/PREFIX sebelum menyentuh storage; deleteGuideObject memvalidasi format kunci; respons JSON
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data sensitif baru tersimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat storage/DB dilog terstruktur (videoId/userId, tanpa URL presigned); user menerima pesan umum (503 'Layanan sedang tidak tersedia.')
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — URL presigned tidak dilog dan berumur 1 jam; objek video/poster terhapus terjamin (jadwal StorageCleanup dalam transaksi hapus)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: memakai klien S3 dan TLS proxy yang ada
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru di task ini; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — baris dihapus + jadwal dibuat dalam satu transaksi; job hanya menghapus bila baris GuideVideo sudah tidak ada (id tidak pernah dipakai ulang); poster yang selesai setelah video dihapus dibuang (updateMany READY guard); ambil-ulang sumber di klien dibatasi sekali per 5 menit saat galat
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — hapus kunci persis (abortMultipartFor menolak kunci berakhiran '/'), tidak pernah per prefix untuk objek panduan → tidak bisa menghapus objek lain; batas 5 video per artikel ditampilkan sejak awal
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — /sumber GET tanpa efek samping, JSON {ok, src, poster}; tanpa batas laju khusus secara sengaja: biayanya 1 query + presign lokal dan butuh sesi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tidak ada konfigurasi baru; tsconfig mengecualikan test-results/playwright-report (folder keluaran uji)
