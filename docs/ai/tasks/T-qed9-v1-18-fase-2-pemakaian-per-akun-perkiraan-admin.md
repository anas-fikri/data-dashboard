---
id: T-qed9
title: 'v1.18 fase 2: pemakaian per akun (perkiraan, admin) — query berjalan, detik query 15 menit, job berjalan, kuota'
status: todo
profile: standard
created: "2026-11-11T14:35:10Z"
updated: "2026-11-11T14:35:27Z"
created_by: claude-code
---

## Objective
Admin melihat akun mana yang paling membebani server saat ini sebagai perkiraan: waktu eksekusi query DuckDB ± 15 menit terakhir, query yang sedang berjalan, pekerjaan worker yang berjalan (unggah, olah ulang/pemetaan, ekspor/PDF), dan storage terpakai — tanpa mengklaim CPU/RAM persis per user.

## Acceptance criteria
- [ ] Tabel per akun (admin): query berjalan, detik query 15 menit terakhir, job unggah/ingest/ekspor/PDF berjalan, kuota storage terpakai — urut terberat

## Risk
Impact: instrumentasi QueryEngine.withUser/withGlobal dan GridGate.withUser (AsyncLocalStorage; tanpa mengubah urutan slot), pelapor app/worker menulis 1 hash + 1 ember menit per 10 dtk, API admin membaca job aktif (≤ 100/antrean) + userUsage ≤ 20 akun (cache 60 dtk). Security (STRIDE): Information disclosure — email/nama akun hanya di API admin (404 non-admin); tidak ada isi query/data. DoS — tabel dibatasi 20, gagal per akun tidak menjatuhkan halaman. Rollback: tanpa migrasi; kunci Redis metrics:acct:* kedaluwarsa sendiri. Validation: unit pelacak (ALS, idempoten, berjalan lintas snapshot), store (jendela 15 menit, proses basi), ranking, pemasangan di QueryEngine/GridGate nyata; e2e tabel per akun + kegagalan sebagian; suite query/lib 683 lulus.

## Notes
