---
id: T-066
title: Tampilkan versi aplikasi di UI dan /health, tag image Docker dengan versi
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ops
  - ui
created: "2026-10-21T10:24:04Z"
updated: "2026-10-21T10:24:04Z"
created_by: claude-code
---

## Objective
Rilis 1.0.0 sudah dibuat lewat aitk release, tetapi pengguna, admin, dan image Docker tidak menunjukkan versinya. Versi dibaca dari package.json saat build (satu sumber), tampil di menu akun dan /health (detail admin), dan menjadi tag image bawaan skrip deploy; rilis berikutnya per tonggak goal sebagai versi minor (v1.1.0 …). Rencana G-7 §3.5.

## Acceptance criteria
- [ ] Given aplikasi dibangun dari package.json versi 1.0.0, when pengguna yang login membuka menu akun (avatar), then tampil teks 'Versi 1.0.0' (kecil, muted) di bagian bawah menu, dan nilai berasal dari package.json saat build (bukan diketik ulang di kode)
- [ ] Given admin login, when membuka /health dan GET /api/health, then detail admin memuat versi aplikasi (dan commit pendek bila tersedia dari build arg); given tanpa sesi admin, then versi dan commit TIDAK tampil (publicView tetap hanya status keseluruhan)
- [ ] Given deploy/images.sh build atau deploy/upgrade.sh build tanpa IMAGE_TAG eksplisit, when dijalankan, then image app/worker/renderer/backup ditandai v<versi package.json> (mis. v1.0.0), IMAGE_TAG di .env.prod diisi tag itu, dan IMAGE_TAG eksplisit tetap menang; docker-compose.prod.yml fallback latest tidak berubah
- [ ] Given worker dan renderer, when start, then log pino pertama memuat field version yang sama dengan aplikasi; given unit test, then modul versi teruji dan npm run check hijau
- [ ] Given docs/runbook-deploy.md dan panduan-developer.md, then tercatat alur rilis per tonggak: aitk release (minor per tonggak G-7) → build image bertag versi → upgrade.sh; tag lama tetap tersedia untuk rollback

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
