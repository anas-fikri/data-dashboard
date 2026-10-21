# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Rollback setelah migrasi segmen = image prev + database dari dump yang diambil setelah app/worker berhenti, dipulihkan dalam satu transaksi; batasnya 24 jam GC segmen sejak start PERTAMA; fungsi bash yang dipanggil dalam konteks || mematikan set -e, jadi setiap gerbang wajib memeriksa status keluarnya sendiri. <!-- aitk:k date=2026-10-20 task=T-023 tags=security -->
- Blok urut grid ±2 s habis di tahap ambil isi semua kolom untuk 200 _row acak (dekompresi semua row group), jadi cache permutasi saja tidak cukup; di 4 vCPU GRID_MAX_CONCURRENCY=1 menjaga widget ≤ 2× saat penggulir mengurutkan. <!-- aitk:k date=2026-10-21 task=T-061 tags=perf -->
- Cache permutasi grid hanya cepat untuk gulir lanjutan; lompatan baru tetap ±3 s karena ambil isi = dekompresi semua row group sumber, dan salinan penuh ±1 GB/tampilan melebihi anggaran 1 GiB. <!-- aitk:k date=2026-10-21 task=T-062 tags=perf,query,conditional -->
