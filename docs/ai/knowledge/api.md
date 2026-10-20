# Knowledge: api

- Jendela baris tanpa urut cukup dari SegmentTyped.dataRows kumulatif + file_row_number per segmen; kolom yang tidak ada di typed segmen harus dibedakan dari gagal cast sebelum membaca raw. <!-- aitk:k date=2026-10-20 task=T-041 tags=api,security,perf -->
- Ekspor tampilan grid harus meniru jalur grid: tampilan polos multi-segmen berurut manifest (bukan ORDER BY _row), dan alias keluaran harus beda dari c<pos> agar ORDER BY tidak mengurutkan nilai yang sudah dinetralkan. <!-- aitk:k date=2026-10-20 task=T-046 tags=api,security,ui -->
