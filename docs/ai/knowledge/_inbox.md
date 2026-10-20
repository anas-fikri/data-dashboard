# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Jendela baris tanpa urut cukup dari SegmentTyped.dataRows kumulatif + file_row_number per segmen; kolom yang tidak ada di typed segmen harus dibedakan dari gagal cast sebelum membaca raw. <!-- aitk:k date=2026-10-20 task=T-041 tags=api,security,perf -->
- Isolasi beban grid harus melewati jatah per-user mesin, tidak hanya membatasi slot global; kalau tidak, penggulir membuat widget dashboard-nya sendiri antre — dan antrean slot wajib menghormati AbortSignal agar blok gulir yang dibatalkan tidak memakan jatah in-flight. <!-- aitk:k date=2026-10-20 task=T-042 tags=perf,security -->
