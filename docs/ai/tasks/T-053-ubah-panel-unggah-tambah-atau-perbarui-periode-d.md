---
id: T-053
title: 'Ubah panel unggah: ''Tambah atau perbarui periode'' dan pemilih periode'
status: todo
profile: standard
goal: G-6
tags:
  - ui
  - upload
depends_on:
  - T-052
created: "2026-10-15T02:30:57Z"
updated: "2026-10-15T02:30:57Z"
created_by: claude-code
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-21, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given dataset periode, when panel unggah dibuka, then tampil dropzone utama 'Tambah atau perbarui periode — periode yang sudah ada akan diganti, bukan digandakan' dan tautan sekunder 'Ganti semua data…' dengan konfirmasi 'Semua 18 periode akan diganti'
- [ ] Given sheet berlabel, when file dipilih, then pemilih periode (satuan dataset, bukan teks bebas) terisi dari nama file dan bisa diubah sebelum diproses; tanpa tebakan, pemilih wajib diisi
- [ ] Given dataset non-periode, then panel sama seperti sekarang dengan tautan 'Ingin menyimpan data per bulan? Atur periode', dan helper e2e lama lolos
- [ ] Given unggahan sedang diproses, then tahap 'Membaca periode' tampil di progres

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
