---
id: T-r5tm
title: 'T-yw88 lanjutan: peringatan pemroses tidak aktif untuk pemetaan/koreksi skema/ekspor + alarm worker mati di luar worker'
status: in_progress
profile: standard
created: "2026-11-11T11:00:57Z"
updated: "2026-11-13T04:41:06Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 8b0a10fcb5104d36c2da2da4aa0a1ff7ec175f9f
---

## Objective
Peringatan "pemroses tidak aktif" untuk pemetaan, koreksi skema, dan ekspor, plus email admin dari app bila worker mati ≥ 10 menit (monitor email berjalan di worker sehingga tidak bisa melaporkan dirinya sendiri).

## Acceptance criteria
- [ ] Status koreksi skema, pemetaan, dan ekspor CSV/XLSX/PDF yang antre/berjalan membawa workerDown bila antrean terkait tidak punya worker; panel menampilkan peringatan (tidak perlu mengulang)
- [ ] App produksi memeriksa worker antrean tiap menit; 0 worker ≥ 10 menit → email admin aktif, ulang tiap 6 jam, sekali saat pulih; tanpa email ganda antar proses (lock Redis)
- [ ] Tidak diketahui (CLIENT LIST ditolak/Redis lambat) tidak memicu peringatan atau email; uji unit keputusan alarm, hitung per antrean, reducer ekspor

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-11-11T11:01:11Z Dari review T-yw88 L8: worker mati juga membuat pemetaan (map-version di antrean recast), koreksi skema, dan ekspor diam tanpa peringatan; monitor email berjalan di dalam worker sehingga tidak bisa memberi tahu worker mati. Usul: pakai ingestWorkerCount-serupa per antrean (recast, export) di panel terkait; alarm dari app (mis. cron di service app/backup) bila /health baris Pemroses unggahan gagal > N menit.
- 2026-11-13T04:41:06Z Objective: peringatan pemroses tidak aktif juga untuk pemetaan/koreksi skema/ekspor + alarm worker mati dijalankan app (monitor email ada di worker). Alarm hanya NODE_ENV=production.
