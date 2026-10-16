---
id: T-z5nq
title: Rapikan objek video panduan yatim dan polish bagian Video
status: todo
profile: standard
depends_on:
  - T-021
created: "2026-10-16T21:53:58Z"
updated: "2026-10-16T22:02:08Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given penghapusan objek video/poster gagal di storage, when video atau artikel dihapus, then kunci dicatat ke StorageCleanup dan dibersihkan ulang oleh job pembersihan (tidak ada objek yatim permanen); poster yang diunggah bersamaan dengan hapus video juga terhapus
- [ ] Given halaman Panduan dibiarkan terbuka > 1 jam, when pengguna memutar atau melompat di video, then URL video diperbarui tanpa memuat ulang halaman
- [ ] Given editor artikel di 768–1023 px, when ada dua video atau lebih, then grid video mengikuti lebar kontainer (bukan viewport), judul bagian tidak terpecah oleh EmptyState, pesan hasil lama hilang setelah aksi berikutnya, dan nama file panjang bisa dibaca utuh

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-16T22:02:08Z Dari review T-021 putaran 2 (non-blocking): (1) Medium a11y — saat admin mengetik di kolom lain, pesan 'Video … tersimpan.' tidak difokus dan wilayah status dikosongkan bersamaan → pembaca layar bisa tidak mengumumkan; isi wilayah status dengan pesan akhir (video-upload.tsx). (2) Low UX — di 5 video form tetap bisa memilih/membaca file sebelum ditolak saat init; tampilkan batas di awal.
