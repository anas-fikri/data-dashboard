# Knowledge: query

- Konstruktor ParquetCache membersihkan semua yang bukan *.parquet di direktori cache (termasuk subdirektori): jangan buat cache kedua di subdirektori cache lain yang masih akan dibuka ulang — di uji, buat deps() dulu baru cache kedua; dan cache di luar allowed_directories DuckDB ditolak 'Permission Error' (sandbox bekerja). <!-- aitk:k date=2026-10-19 task=T-037 tags=query,perf -->
