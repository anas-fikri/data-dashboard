# Knowledge: perf

- Isolasi beban grid harus melewati jatah per-user mesin, tidak hanya membatasi slot global; kalau tidak, penggulir membuat widget dashboard-nya sendiri antre — dan antrean slot wajib menghormati AbortSignal agar blok gulir yang dibatalkan tidak memakan jatah in-flight. <!-- aitk:k date=2026-10-20 task=T-042 tags=perf,security -->
