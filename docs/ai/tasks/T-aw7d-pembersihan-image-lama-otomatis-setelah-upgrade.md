---
id: T-aw7d
title: Pembersihan image lama otomatis setelah upgrade sukses
status: in_review
profile: standard
created: "2026-11-08T01:40:25Z"
updated: "2026-11-08T01:56:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 696c3707868f2cdab09357ff2997f7f4a8200c49
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-08T01:56:07Z"
      findings: 0
---

## Objective
Setelah upgrade produksi lulus verifikasi, upgrade.sh menghapus image dashboard-* rilis lama secara otomatis (menyisakan rilis aktif, image rollback upgrade terakhir, :latest, dan image yang dipakai container) agar disk olympus tidak penuh tiap rilis; perintah manual prune-images; runbook §20.

## Acceptance criteria
- [x] Given start lulus verifikasi, when selesai, then tag dashboard-* lama dihapus kecuali IMAGE_TAG aktif, prev-<STAMP> terakhir, :latest, dan image yang dipakai container
- [x] Given IMAGE_TAG kosong atau daftar container gagal dibaca, when prune-images, then batal tanpa menghapus apa pun

## Risk
Impact: skrip upgrade produksi di VM bersama (olympus) menghapus image dashboard-* lama setelah start lulus verifikasi. Security (STRIDE): Tampering/DoS — salah hapus image aplikasi lain atau image rollback dicegah: filter nama tepat dashboard-{app,worker,renderer,backup}, pengecualian IMAGE_TAG aktif + prev-<STAMP> + :latest + image yang dipakai container, docker rmi tanpa -f/prune, IMAGE_TAG divalidasi pola ketat, berhenti bila docker ps gagal. Rollback: rollback cepat tetap memakai prev-<STAMP> upgrade terakhir; rilis lebih lama = restore backup/build ulang (runbook §20). Validation: stub docker (8 skenario termasuk IMAGE_TAG kosong, image dipakai container, rmi ditolak, aplikasi lain), bash -n, review subagen 0 blocking.

## Notes

- 2026-11-08T01:56:07Z Bukti: stub docker — tag lama dihapus, v1.10.0/prev-<STAMP>/image dipakai container/aplikasi lain/<none> utuh, rmi ditolak dilaporkan; IMAGE_TAG kosong → GAGAL tanpa rmi; review subagen 0 blocking (Low: docker ps gagal → die, :latest dipertahankan — diterapkan).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: skrip pemilik di VM; hanya memanggil docker CLI lokal
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — IMAGE_TAG divalidasi ^[A-Za-z0-9][A-Za-z0-9._-]*$, nama image difilter pola ketat dan di-quote (tanpa injeksi)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan galat tanpa rahasia; .env.prod hanya dibaca IMAGE_TAG
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — hanya setelah VERIFIED_AT; subshell sehingga kegagalan tidak membatalkan upgrade; PRUNE_IMAGES=0 untuk melewati
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa docker prune/-f (default aman)
