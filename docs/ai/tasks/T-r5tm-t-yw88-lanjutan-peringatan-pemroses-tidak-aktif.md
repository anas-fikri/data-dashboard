---
id: T-r5tm
title: 'T-yw88 lanjutan: peringatan pemroses tidak aktif untuk pemetaan/koreksi skema/ekspor + alarm worker mati di luar worker'
status: todo
profile: standard
created: "2026-11-11T11:00:57Z"
updated: "2026-11-11T11:01:11Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T11:01:11Z Dari review T-yw88 L8: worker mati juga membuat pemetaan (map-version di antrean recast), koreksi skema, dan ekspor diam tanpa peringatan; monitor email berjalan di dalam worker sehingga tidak bisa memberi tahu worker mati. Usul: pakai ingestWorkerCount-serupa per antrean (recast, export) di panel terkait; alarm dari app (mis. cron di service app/backup) bila /health baris Pemroses unggahan gagal > N menit.
