# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Rollback setelah migrasi segmen = image prev + database dari dump yang diambil setelah app/worker berhenti, dipulihkan dalam satu transaksi; batasnya 24 jam GC segmen sejak start PERTAMA; fungsi bash yang dipanggil dalam konteks || mematikan set -e, jadi setiap gerbang wajib memeriksa status keluarnya sendiri. <!-- aitk:k date=2026-10-20 task=T-023 tags=security -->
