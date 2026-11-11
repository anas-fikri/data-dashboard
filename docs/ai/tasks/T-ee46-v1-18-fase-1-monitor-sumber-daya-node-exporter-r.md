---
id: T-ee46
title: 'v1.18 fase 1: monitor sumber daya — node-exporter + relay, sampler app → Redis, kartu sidebar (semua user), halaman adm…'
status: in_progress
profile: standard
created: "2026-11-11T14:35:09Z"
updated: "2026-11-11T15:09:26Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 320d80782f5862b22eb381f8d959b8ff393bea5f
---

## Objective
Pemilik dan semua user login bisa melihat sekilas beban server (CPU, RAM, disk, jaringan, status pemroses unggahan) di sidebar, dan admin bisa mencari penyebab server lambat (grafik 1 jam/24 jam, disk per mount, load per inti, iowait, pemakaian container app/worker) tanpa SSH — menjawab insiden 2026-11-11 (load 211 tanpa penyebab terlihat, worker mati > 3 jam tanpa kabar). Opt-in lewat profil compose `monitor` + METRICS_NODE_URL; tanpa itu tidak ada container baru dan kartu tidak tampil.

## Acceptance criteria
- [ ] node-exporter (dipin digest, host network + pid host, rootfs ro, 127.0.0.1:9100) + metrics-relay socat bersumber APP_SUBNETS (pola pg-relay) di compose produksi; runbook §29 pasang/verifikasi/rollback
- [ ] Sampler di proses app tiap 10 dtk (satu sampler lewat kunci Redis): CPU %, load, RAM/swap, disk, jaringan ↓↑ antarmuka fisik, antrean ingest + jumlah worker; riwayat 1 jam/10 dtk + 24 jam/1 menit; METRICS_NODE_URL kosong → mati dengan pesan
- [ ] Kartu sidebar untuk semua user login: angka + sparkline 1 jam, status pemroses + antrean, warna ambang, polling 10 dtk berhenti saat tab tersembunyi; sidebar diciutkan → ikon status
- [ ] Halaman Admin › Sumber daya: grafik 1 jam/24 jam + tabel per layanan (app, worker dari cgroup sendiri); API admin 403 untuk non-admin; API tidak memuat host/IP/nama antarmuka

## Risk
Impact: kartu baru di sidebar semua halaman (polling 10 dtk/user, berhenti saat tab tersembunyi atau monitor mati), dua container baru di VM bersama (node-exporter host network + pid host baca-saja, metrics-relay socat), sampler 1 permintaan HTTP/10 dtk di proses app, Redis ± 0,5 MB. Security (STRIDE): Information disclosure — API semua user hanya angka gabungan (tanpa host/IP/antarmuka/mount/jumlah worker), API admin 404 untuk non-admin; exporter hanya 127.0.0.1, relay hanya APP_SUBNETS, tanpa docker.sock, image dipin digest, cap_drop ALL + read_only + no-new-privileges; DoS — fetch timeout 3 dtk, kunci Redis satu sampler, daftar dipangkas. Rollback: tanpa migrasi; image v1.17.x aman, matikan profil monitor (runbook §29). Validation: unit (parser fixture node_exporter asli, hitung titik, Redis palsu, cgroup v1/v2, env), e2e metrics.spec (akses 401/404, kartu, ikon diciutkan, halaman admin), sampler nyata dengan node-exporter lokal mengisi Redis.

## Notes
- 2026-11-11T14:35:26Z Keputusan pemilik 2026-11-11: ringkasan server untuk semua user login (asumsi aman: per layanan + per akun admin saja), node_exporter boleh, per akun perkiraan. Rencana docs/ai/plans/2026-11-11-monitor-sumber-daya.md, ADR-0010 (proposed).
- 2026-11-11T15:09:26Z AC deviasi tercatat: port exporter 127.0.0.1:19109 (bukan 9100, agar tidak bentrok node_exporter aplikasi lain di VM bersama), relay 172.17.0.1:19100; API admin non-admin = 404 (pola requireAdmin proyek, bukan 403). Fallback cgroup v1 ditambah (sandbox v1).
