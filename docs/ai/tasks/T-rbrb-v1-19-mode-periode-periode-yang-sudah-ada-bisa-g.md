---
id: T-rbrb
title: 'v1.19: mode periode — periode yang sudah ada bisa Ganti / Tambah baris / Perbarui berdasarkan kunci (upsert), bukan han…'
status: todo
profile: standard
created: "2026-11-11T16:33:38Z"
updated: "2026-11-11T16:33:39Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Per unggahan (atau per periode di layar tinjauan) pilih: Ganti utuh (sekarang), Tambah (baris file ditambahkan ke periode), atau Perbarui berdasarkan kunci (baris berkunci sama diganti versi file, kunci baru ditambah, baris lama yang tidak ada di file tetap)
- [ ] Kunci = satu/lebih kolom pilihan pemilik per dataset (mis. No. Resi); kunci kosong/duplikat di file dilaporkan di tinjauan sebelum diterapkan
- [ ] Tinjauan menampilkan per periode: diperbarui N, ditambah N, tetap N (bukan hanya Sekarang/Setelah)
- [ ] Tidak ada periode yang menyusut tanpa sengaja: periode yang datanya lebih sedikit dari sekarang bisa dikecualikan dari unggahan di layar tinjauan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T16:33:39Z Permintaan pemilik 2026-11-11 (tangkapan layar tinjauan: April 2026 115.741 → 34.024 'Diganti'). Butuh keputusan desain: cakupan kunci (per periode vs seluruh dataset — baris yang tanggalnya pindah periode), aturan duplikat, ADR baru. Dikerjakan setelah v1.18 bersama T-jsmj.
