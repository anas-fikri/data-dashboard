# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Rollback setelah migrasi segmen = image prev + database dari dump yang diambil setelah app/worker berhenti, dipulihkan dalam satu transaksi; batasnya 24 jam GC segmen sejak start PERTAMA; fungsi bash yang dipanggil dalam konteks || mematikan set -e, jadi setiap gerbang wajib memeriksa status keluarnya sendiri. <!-- aitk:k date=2026-10-20 task=T-023 tags=security -->
- Blok urut grid ±2 s habis di tahap ambil isi semua kolom untuk 200 _row acak (dekompresi semua row group), jadi cache permutasi saja tidak cukup; di 4 vCPU GRID_MAX_CONCURRENCY=1 menjaga widget ≤ 2× saat penggulir mengurutkan. <!-- aitk:k date=2026-10-21 task=T-061 tags=perf -->
- Cache permutasi grid hanya cepat untuk gulir lanjutan; lompatan baru tetap ±3 s karena ambil isi = dekompresi semua row group sumber, dan salinan penuh ±1 GB/tampilan melebihi anggaran 1 GiB. <!-- aitk:k date=2026-10-21 task=T-062 tags=perf,query,conditional -->
- Skrip perf yang memajukan jam wajib membatasi job pemeliharaan (retensi raw, cleanup, GC) ke dataset uji — tanpa itu file sumber dataset lain ikut terhapus lebih awal; backup harian = dump + seluruh bucket, jadi seminggu pertama satu unggahan menambah file asli + parquet. <!-- aitk:k date=2026-10-21 task=T-063 tags=perf,e2e,ops -->
- Artikel panduan baru terbit lewat seed tanpa --update, tetapi artikel lama yang diubah hanya diperbarui dengan --update --only <slug>. <!-- aitk:k date=2026-10-21 task=T-064 tags=docs,uat -->
- Satu sumber versi = package.json: server membaca lewat src/lib/version.ts (server-only) dan meneruskan ke klien lewat props; cek tag di bash jangan lewat 'docker ps | grep -q' (SIGPIPE+pipefail membuat cek lolos). <!-- aitk:k date=2026-10-21 task=T-066 tags=ops,ui -->
- Show Values As dihitung sebagai lapisan di atas UNION pivot (CTE ber-window) hanya bila showAs dipakai, sehingga SQL dan kunci cache spec lama tidak berubah. <!-- aitk:k date=2026-10-21 task=T-067 tags=query,ui -->
- useContainerWidth react-grid-layout hanya mengukur saat mount — kontainer yang dirender bersyarat butuh use-grid-width; tes piksel yang lulus sendiri tapi gagal saat suite utuh bisa menandakan lebar grid basi. <!-- aitk:k date=2026-10-21 task=T-1zdf -->
- NULLIF/CASE di DuckDB diuraikan menjadi CASE yang menyalin operand — penjaga bertingkat (rumus 6 tingkat) membuat perencana eksponensial; pakai list_filter([x], lambda v: isfinite(v))[1] yang menulis operand sekali. <!-- aitk:k date=2026-10-21 task=T-068 tags=security,query -->
- Penyusun rumus berbasis token harus diurai ke pohon yang sama dengan validasi server; angka ketikan harus mengikuti konvensi id-ID secara eksplisit — '0.125' bukan ribuan. <!-- aitk:k date=2026-10-21 task=T-069 tags=ui -->
