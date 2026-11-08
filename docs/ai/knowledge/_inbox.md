# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Tag image rilis harus diturunkan/dicek dari versi kode yang dibangun; tag eksplisit bebas pernah membuat image v1.8.1 berisi kode 1.8.0. <!-- aitk:k date=2026-11-06 task=T-jd1g tags=deploy -->
- Context.Provider dari modul 'use client' tidak bisa dipakai langsung di server component (Provider = undefined di referensi klien, error 'Element type is invalid') — bungkus dalam komponen client (DashboardColorsProvider). Field spec yang menyimpan posisi kolom (columns, formatColumns, status[].column) harus ikut dipetakan di remap.ts saat ganti data. <!-- aitk:k date=2026-11-06 task=T-z1vv tags=ui -->
- Tren per bulan/kuartal/tahun harus memakai x = indeks bulan kalender (trendX), bukan milidetik — panjang bulan berbeda membuat 'naik 100 per bulan' terbaca 101,15. Garis dan legendanya harus memakai satu fungsi pemilih titik (trendPoints) agar tidak berbeda. Potongan data yang bergantung ukuran kartu harus terjadi sebelum pengurutan ulang dan tidak boleh mengenai tabel data/daftar ringkas. <!-- aitk:k date=2026-11-07 task=T-ykyd -->
- Pembersihan image di VM bersama: pilih tag lewat pola nama tepat + daftar pengecualian (aktif, rollback, dipakai container) dan pakai docker rmi per tag tanpa -f — jangan docker image/system prune, yang ikut menghapus image aplikasi lain dan tag rollback. <!-- aitk:k date=2026-11-08 task=T-aw7d -->
- Nilai warisan butuh tiga keadaan yang bisa disimpan: ikut bawaan (tidak disimpan), eksplisit, dan sengaja kosong ('none') — tanpa 'none', pengecualian tidak mungkin begitu bawaan diaktifkan; editor di luar cakupan (pivot tersimpan) harus menawarkan 'none' juga. <!-- aitk:k date=2026-11-08 task=T-a7se -->
- Elemen dengan container-type (Tailwind @container) punya lebar intrinsik nol — lebar 'auto' di baris flex runtuh ke padding; beri lebar tetap (mis. rel w-14) bila isinya harus menentukan lebar. <!-- aitk:k date=2026-11-08 task=T-5edy -->
