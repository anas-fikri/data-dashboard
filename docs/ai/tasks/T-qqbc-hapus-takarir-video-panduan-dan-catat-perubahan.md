---
id: T-qqbc
title: Hapus takarir video panduan dan catat perubahan media video di audit
status: todo
profile: standard
depends_on:
  - T-j9j6
created: "2026-10-17T11:09:53Z"
updated: "2026-10-17T11:47:13Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:47:11Z"
      findings: 5
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:47:12Z"
      findings: 3
    - "n": 3
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:47:13Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given video bertakarir, when admin memilih Hapus takarir di editor, then objek .vtt dihapus, captionKey dikosongkan, dan pemutar tidak lagi menampilkan tombol takarir
- [x] Given admin menambah/mengganti/menghapus takarir atau poster, when tersimpan, then AuditLog mencatat aksi guide.video.* dengan {videoId, articleId} tanpa isi file

## Risk
- Impact: takarir video panduan bisa dihapus (DELETE /api/guides/videos/[id]/takarir, tombol "Hapus takarir" + dialog konfirmasi); takarir kini disimpan dengan kunci baru per unggahan (guides/captions/<id>-<acak>.vtt), kunci lama dijadwalkan + dihapus; baris video dikunci (SELECT … FOR UPDATE) saat simpan/hapus takarir, hapus video, dan hapus artikel; audit baru guide.video.caption, guide.video.caption.delete, guide.video.poster; job storage-cleanup menganggap kunci takarir "dipakai" hanya bila captionKey baris menunjuknya.
- Security (STRIDE): Repudiation — perubahan media video tercatat di AuditLog dalam transaksi yang sama dengan perubahan baris (meta {videoId}, tanpa isi file). Tampering/Integrity — hapus/ganti takarir tidak pernah menimpa atau menghapus unggahan yang sedang berjalan (kunci berbeda + baris terkunci); tidak ada TOCTOU di job (kunci lama tidak pernah dipakai ulang). Elevation — DELETE lewat uploadRoute (Origin sama, sesi, batas laju), non-admin 404. DoS — tidak ada beban baru yang berarti (satu SELECT FOR UPDATE per aksi admin).
- Rollback: revert commit T-qqbc (tanpa migrasi). Kode lama menolak kunci takarir bersufiks (GET → 503), jadi sebelum revert kosongkan dulu: UPDATE "GuideVideo" SET "captionKey" = NULL WHERE "captionKey" LIKE 'guides/captions/%-%.vtt'; objek guides/captions/*-*.vtt yang tersisa dihapus manual. Takarir lalu diunggah ulang.
- Validation: vitest videos-cleanup (kunci baru per unggahan, ganti menjadwalkan + menghapus kunci lama, baris hilang saat dikunci → objek baru dibuang tanpa audit, deleteVideo memakai captionKey terkunci, hapus takarir sukses/gagal storage/tanpa takarir/NOT_FOUND, audit poster), cleanup (kunci takarir dipakai = captionKey menunjuknya; kunci bersufiks); e2e guide-videos 8/8 (hapus lewat dialog, Batal mengembalikan fokus ke pembuka, sesudah hapus fokus ke tombol tambah, track hilang, sumber 404); review 2 putaran.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tetap (editor admin → route takarir → service → DB/storage); urutan kunci baris konsisten artikel → video di semua transaksi yang menyentuh keduanya
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: memakai requireUser yang ada (uploadRoute)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — DELETE takarir lewat uploadRoute (Origin sama, sesi, batas laju); non-admin → 404 lewat ownVideo; GET tetap aturan akses halaman
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id divalidasi cuid; kunci takarir dibangun server (guides/captions/<cuid>-<12 hex>.vtt) dan dicek pola ketat di setiap operasi storage dan di job
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: akhiran kunci acak (randomBytes) hanya untuk keunikan, bukan rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat hapus objek dicatat (videoId, tanpa isi file) dan diulang job; dialog hapus menampilkan pesan galat yang difokus; audit tanpa isi file
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — takarir yang dihapus/diganti benar-benar dihapus dari storage (jadwal dalam transaksi + hapus sesudah commit, diulang job bila gagal); file unggahan yang gagal commit ikut dijadwalkan sejak sebelum ditulis
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit + osv-scanner 0 temuan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — baris video dikunci (FOR UPDATE) saat simpan/hapus takarir, hapus video, hapus artikel; kunci baru per unggahan → hapus/ganti tidak pernah menimpa/menghapus unggahan bersamaan; audit guide.video.caption/caption.delete/poster dalam transaksi yang sama
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — ukuran tetap ≤ 200 KB; tidak ada objek yatim permanen (kunci lama + kunci unggahan dijadwalkan); job menganggap kunci takarir dipakai hanya bila captionKey menunjuknya
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — DELETE /api/guides/videos/[id]/takarir JSON {ok, videoId} / galat dengan status HTTP konsisten (403/401/404/429)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
