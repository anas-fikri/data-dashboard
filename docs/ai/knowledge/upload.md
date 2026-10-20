# Knowledge: upload

- Input file yang dikosongkan (value='') juga mengosongkan FileList dari event — salin dulu; kedaluwarsa antrean harus dihitung dari aktivitas antrean, bukan updatedAt item yang masih menunggu. <!-- aitk:k date=2026-10-20 task=T-059 tags=upload,ui -->
- Lebih dari satu segmen per periode per sheet hanya sah sebagai satu kelompok lengkap (groupId sama, nomor file berbeda, jumlah = groupSize) — semua pembaca manifest harus mengumpulkan segmen per periode, bukan find() satu; file kembar dalam kelompok harus ditolak lewat sha256. <!-- aitk:k date=2026-10-20 task=T-060 tags=upload,ingest,optional -->
