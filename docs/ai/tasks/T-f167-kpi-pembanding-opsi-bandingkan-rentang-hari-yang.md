---
id: T-f167
title: 'KPI pembanding: opsi bandingkan rentang hari yang sama (mis. 1–13 Nov vs 1–13 Okt) saat periode terakhir belum penuh'
status: in_progress
profile: standard
created: "2026-11-13T15:17:48Z"
updated: "2026-11-13T15:21:26Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 57dda7293c4726d34d457b5936f94072a917728e
---

## Objective
Widget Angka berpembanding bisa membandingkan periode berjalan dengan rentang hari yang sama di periode pembanding (mis. 1–13 Okt untuk 1–13 Nov), tanpa mengubah bawaan periode penuh.

## Acceptance criteria
- [x] Given widget Angka berpembanding, when pemilik memilih 'Rentang hari yang sama', then periode pembanding dipotong ke jumlah hari yang sama dengan periode berjalan (mis. 1–13 Okt untuk 1–13 Nov; minggu: Senin–hari yang sama; tahun lalu: tanggal yang sama tahun lalu)
- [x] Bawaan tetap 'Periode penuh' (angka widget yang ada tidak berubah); pilihan tersimpan di spec compare (opsional, rollback aman)
- [x] Teks pembanding menyebut rentangnya (mis. 'vs 1–13 Okt 2026'); PDF/ekspor ikut; bulan dengan hari lebih sedikit (31 Mar → 28/29 Feb) dijepit ke akhir bulan
- [x] Uji unit SQL batas periode (DuckDB) untuk bulan/minggu/kuartal/tahun + uji teks; panduan susun-dashboard diperbarui

## Risk
Impact: spec KPI compare (field opsional range), SQL batas periode, teks pembanding, panel Angka, panduan 06. Security (STRIDE): Tampering — nilai range divalidasi zod enum; SQL tanpa input user baru (interval/hari dihitung DuckDB). Rollback: versi lama menolak spec ber-range (zod strict) → widget yang memakai Hari yang sama tampil 'pengaturan tidak valid' sampai dikembalikan ke Periode penuh; bawaan tidak tersimpan. Validation: uji DuckDB bulan/minggu/jepit akhir bulan, uji teks; aitk check.

## Notes
- 2026-11-13T15:17:49Z Dari T-tyb1 (keputusan: bawaan tetap periode penuh + keterangan s.d.). Query: buildPeriodBoundsSql sudah mengembalikan ld (tanggal data terakhir); pe = ps + (ld - cs + 1 hari) dijepit ke akhir periode pembanding.
- 2026-11-13T15:21:26Z Kuartal/tahun memakai rumus yang sama (diuji bulan + minggu di DuckDB). Ekspor KPI tidak punya kolom periode (catatan lama T-tyb1) — tetap di luar cakupan.
