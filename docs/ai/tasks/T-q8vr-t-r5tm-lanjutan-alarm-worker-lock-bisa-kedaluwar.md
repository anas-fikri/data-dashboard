---
id: T-q8vr
title: 'T-r5tm lanjutan: alarm worker — lock bisa kedaluwarsa saat SMTP lambat; worker crash-loop tidak memicu alarm'
status: in_progress
profile: standard
created: "2026-11-13T04:44:33Z"
updated: "2026-11-13T05:55:04Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 92ee2167e0c44e5c14ba489fad8cabd1ccf0d87f
---

## Objective
Alarm worker mati (T-r5tm) tidak mengirim email ganda saat SMTP lambat dan tetap menyala untuk worker yang crash-loop.

## Acceptance criteria
- [x] Status alarm disimpan sebelum email dikirim; email gagal memulihkan status lama — SMTP lambat tidak menghasilkan email ganda antar proses
- [x] Worker crash-loop (hidup sebentar lalu mati lagi) tetap memicu alarm setelah 10 menit; pulih hanya setelah worker hidup stabil 10 menit

## Risk
Impact: hanya logika alarm email di app produksi; email pulih kini tertunda 10 menit (stabil). Security (STRIDE): DoS email — dibatasi status tersimpan sebelum kirim + ulang 6 jam. Rollback: versi sebelumnya (status Redis kompatibel: field upSince diabaikan). Validation: uji unit keputusan termasuk crash-loop; aitk check.

## Notes
