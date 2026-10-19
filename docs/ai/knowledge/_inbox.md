# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Di xlsxSheetsParallel, RawSheetWriter.finish berjalan di dalam antrean DuckDB FIFO — menahan finish di tes memblokir semua sheet; untuk memaksa urutan selesai, tahan job.done (pembacaan worker) yang ada di luar antrean. <!-- aitk:k date=2026-10-18 task=T-pbz0 tags=bug -->
- docker-compose.prod.yml bernama 'dashboard': setiap salinan di VM yang sama WAJIB -p sendiri, dan docker load berbagi image store dengan produksi — arsip bertag sama (mis. latest) diam-diam memindahkan tag produksi, jadi catat ID image produksi sebelum load. <!-- aitk:k date=2026-10-19 task=T-tqse -->
