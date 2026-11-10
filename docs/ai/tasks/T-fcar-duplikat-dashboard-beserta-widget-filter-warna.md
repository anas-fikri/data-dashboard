---
id: T-fcar
title: Duplikat dashboard (beserta widget, filter, warna)
status: in_progress
profile: standard
tags:
  - dashboards
created: "2026-11-10T01:17:10Z"
updated: "2026-11-10T01:17:59Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9ca8a2a2e934ddf919c38e97484957f7a84f7b2e
---

## Objective
Pemilik/editor menyalin dashboard dalam satu klik untuk dijadikan template cabang/periode lain: salinan berisi widget (tata letak + pengaturan), kolom filter + filter bawaan, dan warna dashboard; pemilik salinan = yang menyalin, tanpa ikut berbagi dari dashboard asal.

## Acceptance criteria
- [ ] Given pemilik dashboard (dashboard selalu berada di dataset pemiliknya, jadi editor/viewer tidak bisa membuat salinan di dataset orang lain), when memilih Duplikat dan memberi nama, then dashboard baru di dataset yang sama dibuat dengan semua widget, tata letak, kolom filter, filter bawaan, dan warna yang sama, lalu dibuka
- [ ] Given dashboard asal dibagikan ke orang lain, when diduplikat, then salinan TIDAK ikut dibagikan dan perubahan di salinan tidak mengubah dashboard asal
- [ ] Given pengguna tanpa akses (404) atau editor/viewer (403), when meminta duplikat, then ditolak tanpa membocorkan isi; batas 10 dashboard per dataset tetap berlaku

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
