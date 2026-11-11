---
id: T-ee46
title: 'v1.18 fase 1: monitor sumber daya — node-exporter + relay, sampler app → Redis, kartu sidebar (semua user), halaman adm…'
status: in_progress
profile: standard
created: "2026-11-11T14:35:09Z"
updated: "2026-11-11T14:39:51Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 320d80782f5862b22eb381f8d959b8ff393bea5f
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] node-exporter (dipin digest, host network + pid host, rootfs ro, 127.0.0.1:9100) + metrics-relay socat bersumber APP_SUBNETS (pola pg-relay) di compose produksi; runbook §29 pasang/verifikasi/rollback
- [ ] Sampler di proses app tiap 10 dtk (satu sampler lewat kunci Redis): CPU %, load, RAM/swap, disk, jaringan ↓↑ antarmuka fisik, antrean ingest + jumlah worker; riwayat 1 jam/10 dtk + 24 jam/1 menit; METRICS_NODE_URL kosong → mati dengan pesan
- [ ] Kartu sidebar untuk semua user login: angka + sparkline 1 jam, status pemroses + antrean, warna ambang, polling 10 dtk berhenti saat tab tersembunyi; sidebar diciutkan → ikon status
- [ ] Halaman Admin › Sumber daya: grafik 1 jam/24 jam + tabel per layanan (app, worker dari cgroup sendiri); API admin 403 untuk non-admin; API tidak memuat host/IP/nama antarmuka

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T14:35:26Z Keputusan pemilik 2026-11-11: ringkasan server untuk semua user login (asumsi aman: per layanan + per akun admin saja), node_exporter boleh, per akun perkiraan. Rencana docs/ai/plans/2026-11-11-monitor-sumber-daya.md, ADR-0010 (proposed).
