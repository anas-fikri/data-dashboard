# Knowledge: architecture

- Di olympus (HDD, container worker produksi, DuckDB 1.5.6, sandbox) membaca 24 segmen parquet lewat satu parameter listValue nyaris sama cepat dengan satu file untuk query berat (0,97–1,06×); overhead tetap ± 9 ms hanya terlihat pada count tanpa filter, dan halaman OFFSET dalam tanpa urut 1,8× sehingga wajib jalur jendela (segmen, file_row_number) yang p95-nya 22 ms; union_by_name dengan tipe _row campuran tetap memicu galat BLOOM_FILTER, jadi proyeksi eksplisit per kelompok skema wajib. <!-- aitk:k date=2026-10-18 task=T-034 tags=architecture,adr,perf,spike -->
