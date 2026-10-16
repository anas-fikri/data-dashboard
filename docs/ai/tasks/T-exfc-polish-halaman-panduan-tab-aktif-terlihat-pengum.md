---
id: T-exfc
title: 'Polish halaman Panduan: tab aktif terlihat, pengumuman hasil, kartu Mulai di sini'
status: todo
profile: standard
depends_on:
  - T-022
created: "2026-10-16T23:14:23Z"
updated: "2026-10-16T23:23:02Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given 5 tab peran di layar 320 px, when halaman dibuka, then tab aktif tergulir ke dalam layar; jumlah hasil pencarian diumumkan ke pembaca layar; perpindahan tab memberi tanda memuat
- [ ] Given artikel panjang, when pembaca sampai di akhir, then tombol Tandai sudah dibaca juga tersedia di bawah artikel; fokus tidak jatuh ke halaman saat tombol menunggu
- [ ] Given admin atau pemilik lama yang sudah memakai aplikasi, when membuka Beranda, then kartu Mulai di sini hanya tampil untuk pengguna yang benar-benar baru (keputusan produk), dan kepala halaman tanpa artikel bantuan tidak merender wadah aksi kosong

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-16T23:23:02Z Dari verifikasi T-022 putaran 2 (non-blocking): NB1 — panduan/page.tsx memakai q mentah untuk teks status sementara pencarian memakai q bersih (?q=%00%00 → '0 artikel cocok dengan “”'); pakai cleanLine(one(sp.q), SEARCH_MAX). NB2 — remarkShiftHeadings hanya menormalkan judul teratas; lompatan di dalam isi (## lalu ####) tetap; petakan kedalaman berbeda ke tingkat berurutan.
