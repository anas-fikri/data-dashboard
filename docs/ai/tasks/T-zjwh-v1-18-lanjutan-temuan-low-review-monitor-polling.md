---
id: T-zjwh
title: 'v1.18 lanjutan: temuan Low review monitor (polling ganda ponsel, menit hilang setelah jeda, bond/VLAN, cache ringkasan,…'
status: todo
profile: standard
created: "2026-11-11T15:22:00Z"
updated: "2026-11-11T15:22:07Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] L1: kartu Server di <aside> tersembunyi (ponsel) tidak polling; satu sumber data untuk sidebar + drawer
- [ ] L4: menit yang tidak teragregasi karena jeda ≥ 1 menit tetap dirata-rata dari titik 10 dtk (grafik 24 jam tanpa lubang palsu)
- [ ] L7: laju jaringan per antarmuka; bond/anggota bond, VLAN, docker_gwbridge, tailscale/zt/vnet tidak dihitung ganda
- [ ] L8: readSummary di-cache ± 5 dtk per proses (semua user polling 10 dtk)
- [ ] L11: ADR-0010 diperjelas — port 127.0.0.1:19109 terbaca proses/container host network di VM; pids_limit relay

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T15:22:07Z Dari review T-ee46 putaran 1 (2026-11-11): 0 blocking; M1–M7 + L1(useId)/L2/L3/L5/L6/L9/L10 diperbaiki di a04e7fb/53b72de. Sisa Low di sini.
