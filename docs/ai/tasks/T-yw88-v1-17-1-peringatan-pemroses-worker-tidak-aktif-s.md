---
id: T-yw88
title: 'v1.17.1: peringatan pemroses (worker) tidak aktif saat unggahan menunggu di antrean'
status: in_progress
profile: standard
created: "2026-11-11T10:39:51Z"
updated: "2026-11-11T10:45:59Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 8d5bf1d65a1e40cc28ff2c58009660abe1dafe23
---

## Objective
Pemilik/pengunggah langsung tahu bila pemroses unggahan (service worker) tidak aktif: panel progres dataset
menampilkan "Pemroses unggahan sedang tidak aktif" (unggahan menunggu atau terhenti) dengan penjelasan bahwa file
aman di antrean, dan /health admin menampilkan baris "Pemroses unggahan". Pemicu: impor Billing 2026-11-11 menunggu
> 3 jam tanpa kabar karena worker masih dimatikan sejak insiden pagi.

## Acceptance criteria
- [x] Panel progres dataset menampilkan peringatan 'Pemroses unggahan sedang tidak aktif' saat unggahan menunggu/diproses dan tidak ada worker terhubung ke antrean ingest; teks menyebut file aman di antrean dan tidak perlu unggah ulang
- [x] Jumlah worker dibaca dari BullMQ (koneksi Worker bernama), di-cache 10 detik; gagal dibaca → tanpa peringatan (tidak ada alarm palsu)
- [x] /health admin menampilkan baris 'Pemroses unggahan' (OK/gagal + saran); status publik dan /api/health tidak berubah
- [x] Panduan 03, Yang baru 1.17, CHANGELOG, runbook §28 (diagnosa + menyalakan worker mode hemat + setelan 4 vCPU)

## Risk
Impact: route progres dataset (GET, polling) memanggil BullMQ getWorkersCount (CLIENT LIST) — di-cache 10 dtk per
proses app, batas waktu antrean; panel progres; halaman /health (admin). /api/health dan /api/health/core tidak
berubah (deploy.sh, healthcheck container, monitor email).
Security (STRIDE): Info disclosure — panel hanya menampilkan ada/tidaknya pemroses, tanpa nama host/jumlah; baris
/health detail hanya admin (publicView), pesan tanpa host. DoS — CLIENT LIST dibatasi cache 10 dtk; gagal → null.
Rollback: image ke v1.17.0 aman (tanpa migrasi; peringatan hilang).
Validation: unit queue-position (hitung + cache + gagal → null, teks, cek /health); e2e schema AC1 (unggah tanpa
worker → peringatan + workers=0 di API, lalu worker menyala → selesai), e2e health (baris admin).

## Notes
