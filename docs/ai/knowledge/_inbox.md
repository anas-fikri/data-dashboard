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
