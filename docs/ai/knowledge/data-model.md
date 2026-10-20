# Knowledge: data-model

- Typed segmen menambah kolom _src_row: pembaca yang memakai indeks kolom posisi (sampel skema, helper uji SELECT *) harus memilih kolom eksplisit — di DuckDB COLUMNS('^_(src_)?row$') membaca _row dan _src_row bila ada, jadi satu SQL melayani typed lama dan baru. <!-- aitk:k date=2026-10-19 task=T-036 tags=data-model,migration -->
- Nilai _period ditulis dari Segment.periodStart (bukan dari data) setiap recast, jadi periode beku; dev server yang menyala sebelum prisma generate menolak nilai enum baru — restart setelah migrasi. <!-- aitk:k date=2026-10-20 task=T-049 tags=data-model,data-integrity,migration -->
