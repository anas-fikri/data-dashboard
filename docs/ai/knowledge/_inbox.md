# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Jendela baris tanpa urut cukup dari SegmentTyped.dataRows kumulatif + file_row_number per segmen; kolom yang tidak ada di typed segmen harus dibedakan dari gagal cast sebelum membaca raw. <!-- aitk:k date=2026-10-20 task=T-041 tags=api,security,perf -->
- Isolasi beban grid harus melewati jatah per-user mesin, tidak hanya membatasi slot global; kalau tidak, penggulir membuat widget dashboard-nya sendiri antre — dan antrean slot wajib menghormati AbortSignal agar blok gulir yang dibatalkan tidak memakan jatah in-flight. <!-- aitk:k date=2026-10-20 task=T-042 tags=perf,security -->
- AG Grid v36: defaultColDef/columnDefs harus stabil antar render, kalau tidak AG menerapkan ulang kolom dan membuang beku/lebar pengguna; dan klien grid tidak boleh mengirim potongan kolom paralel melebihi jatah in-flight per user di server. <!-- aitk:k date=2026-10-20 task=T-043 tags=ui -->
- Dialog Radix yang ditutup dengan mengosongkan prop target memanggil onCloseAutoFocus setelah target null — simpan target terakhir; dan setiap pergantian tampilan grid wajib mengosongkan jumlah baris agar galat/timeout tidak menampilkan angka tampilan lama. <!-- aitk:k date=2026-10-20 task=T-044 tags=ui,api -->
- Ringkasan grid harus memakai measureExpr KPI agar angkanya identik dengan widget; salin satu sel juga harus dikutip TSV, kalau tidak teks multi-baris dipecah Excel menjadi sel/formula. <!-- aitk:k date=2026-10-20 task=T-045 tags=ui,security -->
- Ekspor tampilan grid harus meniru jalur grid: tampilan polos multi-segmen berurut manifest (bukan ORDER BY _row), dan alias keluaran harus beda dari c<pos> agar ORDER BY tidak mengurutkan nilai yang sudah dinetralkan. <!-- aitk:k date=2026-10-20 task=T-046 tags=api,security,ui -->
- Tampilan besar untuk viewer harus memakai ulang jalur widget (body ⊆ widgetId/dashboardFilters/page/sort) dan tidak mengimpor komponen grid, agar D6 dan anggaran chunk dashboard tetap terjaga. <!-- aitk:k date=2026-10-20 task=T-047 tags=ui,security -->
- AG Community tidak memasang aria-selected untuk pilihan non-AG — pasang sendiri lewat processRowPostCreate + refresh saat pilihan berubah; axe disuntik lewat page.evaluate agar CSP nonce tidak menghalangi. <!-- aitk:k date=2026-10-20 task=T-048 tags=ui,a11y,responsive -->
