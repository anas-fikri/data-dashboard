# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Di cn(), leading-* harus ditulis sesudah text-*. <!-- aitk:k date=2026-10-21 task=T-w764 -->
- Artikel panduan baru selalu terbit di urutan terakhir tab peran; e2e yang memeriksa 'dua artikel terakhir' harus digeser setiap rilis panduan (pakai slice relatif). <!-- aitk:k date=2026-10-21 task=T-076 tags=docs -->
- Artikel panduan hanya satu peran: rujukan lintas artikel harus ke peran sama/ALL (diuji content.test), materi bersama memakai padanan per peran. <!-- aitk:k date=2026-10-22 task=T-7rw4 -->
- edge-tts di container cloud butuh CA proxy (certifi.where → /root/.ccr/ca-bundle.crt lewat pembungkus EDGE_TTS_BIN). <!-- aitk:k date=2026-10-22 task=T-1tzp -->
- Heuristik nama kolom: cocokkan kata besaran di tengah kata hanya bila tidak tepat menempel awalan No/ID/Kode (NOSETORAN = ID, IDRAMOUNT = besaran), pisahkan camelCase dulu, dan keluarkan kolom bagian tanggal (Tahun/Bulan) dari kandidat ukuran; toolbar kanvas hanya melacak tata letak — e2e yang pindah halaman setelah simpan pengaturan widget harus menunggu PATCH-nya sendiri. <!-- aitk:k date=2026-10-22 task=T-12zs tags=ui -->
- verticalCompactor react-grid-layout mengurutkan item menurut (y, x), bukan urutan daftar — untuk mendahulukan satu item (pemulihan) padatkan dulu dengan item itu static, lalu padatkan biasa. <!-- aitk:k date=2026-10-22 task=T-1k96 tags=ui -->
- Editor tidak menerima nama kolom filter tersembunyi, jadi setiap simpan oleh non-pemilik harus menggabungkan kembali kolom tersimpan yang tidak tersedia di server (keepUnavailable) agar tidak terhapus diam-diam. <!-- aitk:k date=2026-10-22 task=T-k2ec tags=ui,security -->
