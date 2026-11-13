# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Atribusi beban per user di proses bersama: ukur di titik sumber daya benar-benar dipegang (slot global DuckDB) dan bawa identitas lewat AsyncLocalStorage dari lapisan otorisasi; mengukur di withUser ikut menghitung waktu antre. <!-- aitk:k date=2026-11-11 task=T-qed9 -->
- Mekanisme kelompok segmen per periode (groupId/groupPart/groupSize) bisa dipakai untuk sumber bagian apa pun (file, sheet), tetapi semua yang per-sheet-data harus tetap tunggal: perubahan skema satu per lineage, layar pemetaan satu raw sheet per lineage — cek setiap jalur yang mengasumsikan 1 bagian sebelum menambah bagian. <!-- aitk:k date=2026-11-12 task=T-jsmj -->
- Pilihan pemilik yang menjanjikan 'data lama tetap' harus ikut dihitung di semua aturan batas/pelepasan (bukan hanya dikecualikan dari unggahan), dan kontrol pilihannya tidak boleh hilang saat pilihan itu sendiri membuat rencana ditolak. <!-- aitk:k date=2026-11-12 task=T-aavf -->
- Deteksi sheet lanjutan tanpa judul butuh syarat struktural (sheet sebelumnya penuh) — pencocokan jenis nilai saja salah menggabung tabel lain yang judulnya teks/angka. <!-- aitk:k date=2026-11-12 task=T-1216 -->
- Menulis ulang periode sebagai kelompok segmen (salinan baris lama + bagian file) memberi upsert tanpa jalur baca baru; salinan harus dipadatkan per (periode, jenis sumber) agar segmen tidak menumpuk, dan sidik Tambah berulang dicek terhadap versi READY karena pemadatan menghapus sidik per segmen. <!-- aitk:k date=2026-11-12 task=T-rbrb -->
- Kolom tambahan widget yang opsional (mis. ukuran pembanding) jangan ikut absentNames widget, agar kolom yang kosong di versi data tidak mengosongkan nilai utama. <!-- aitk:k date=2026-11-13 task=T-g8ht -->
- recastQueue() dan mappingQueue() memakai antrean BullMQ yang sama — hitung sekali. <!-- aitk:k date=2026-11-13 task=T-d6g9 -->
- Bagian opsional widget (pembanding) sebaiknya gagal sendiri (dilewati + teks 'tidak tersedia') tanpa membuat seluruh widget COLUMN_UNAVAILABLE. <!-- aitk:k date=2026-11-13 task=T-djp6 -->
- File typed segmen imutabel (kunci berisi id segmen + revisi skema) aman di-cache lokal tanpa invalidasi; ubah tipe = revisi baru = kunci cache baru. <!-- aitk:k date=2026-11-13 task=T-yg3z -->
- Monitor yang berjalan di dalam worker tidak bisa melaporkan worker mati; pemeriksaan liveness worker harus dijalankan proses lain (app). <!-- aitk:k date=2026-11-13 task=T-r5tm -->
- Laju counter jaringan dihitung per antarmuka agar reset satu antarmuka tidak merusak total; bond menggantikan anggotanya. <!-- aitk:k date=2026-11-13 task=T-zjwh -->
- Deteksi salinan sheet: judul + jumlah baris saja memberi positif palsu untuk potongan sama besar; konfirmasi lewat sidik isi (sum hash baris tanpa kolom teknis). <!-- aitk:k date=2026-11-13 task=T-hgsz -->
- Dashboard.filterColumns menyimpan NAMA sheet: setiap pemetaan sheet saat aktivasi harus ikut mengganti nama di filter, bukan hanya spec widget. <!-- aitk:k date=2026-11-13 task=T-01xj -->
- Fokus sel AG lewat requestAnimationFrame membuat tombol berikutnya berangkat dari sel lama; fokuskan langsung bila sel sudah dirender. <!-- aitk:k date=2026-11-13 task=T-7377 tags=data-view,a11y -->
- Periode KPI berjalan dibandingkan dengan periode pembanding penuh + keterangan s.d.; bandingkan rentang hari sama ditunda (mengubah angka). <!-- aitk:k date=2026-11-13 task=T-tyb1 tags=widgets -->
- Rentang hari yang sama: pe = least(ps + to_days(md - cs + 1), ps + step) di DuckDB; cs - INTERVAL menjadi TIMESTAMP sehingga tambah hari harus INTERVAL (to_days), bukan bilangan. <!-- aitk:k date=2026-11-13 task=T-f167 -->
