---
id: T-f167
title: 'KPI pembanding: opsi bandingkan rentang hari yang sama (mis. 1–13 Nov vs 1–13 Okt) saat periode terakhir belum penuh'
status: todo
profile: standard
created: "2026-11-13T15:17:48Z"
updated: "2026-11-13T15:17:49Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given widget Angka berpembanding, when pemilik memilih 'Rentang hari yang sama', then periode pembanding dipotong ke jumlah hari yang sama dengan periode berjalan (mis. 1–13 Okt untuk 1–13 Nov; minggu: Senin–hari yang sama; tahun lalu: tanggal yang sama tahun lalu)
- [ ] Bawaan tetap 'Periode penuh' (angka widget yang ada tidak berubah); pilihan tersimpan di spec compare (opsional, rollback aman)
- [ ] Teks pembanding menyebut rentangnya (mis. 'vs 1–13 Okt 2026'); PDF/ekspor ikut; bulan dengan hari lebih sedikit (31 Mar → 28/29 Feb) dijepit ke akhir bulan
- [ ] Uji unit SQL batas periode (DuckDB) untuk bulan/minggu/kuartal/tahun + uji teks; panduan susun-dashboard diperbarui

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-13T15:17:49Z Dari T-tyb1 (keputusan: bawaan tetap periode penuh + keterangan s.d.). Query: buildPeriodBoundsSql sudah mengembalikan ld (tanggal data terakhir); pe = ps + (ld - cs + 1 hari) dijepit ke akhir periode pembanding.
