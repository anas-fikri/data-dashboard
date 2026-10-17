# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Tombol yang disabled saat aksi berjalan membuat Chromium memindah fokus ke body beberapa saat kemudian; pakai aria-disabled + aria-busy dan abaikan klik ulang. Membaca ref saat render (role={ref.current ? ...}) gagal lint react-hooks/refs — pakai state. <!-- aitk:k date=2026-10-17 task=T-exfc -->
- Pembersihan objek setelah transaksi DB harus dijadwalkan (baris StorageCleanup) DI DALAM transaksi yang menghapus baris lalu dibuang setelah objek terhapus — mencatat hanya saat gagal (retryLater) kehilangan objek bila proses mati di antara commit dan hapus. Kunci objek tunggal tidak boleh lewat helper hapus/abort per prefix: 'guides/videos/x.mp4' juga cocok dengan 'guides/videos/x.mp4.bak' dst. <!-- aitk:k date=2026-10-17 task=T-z5nq -->
