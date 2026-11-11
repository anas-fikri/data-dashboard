# Knowledge: dashboards

- Dashboard selalu berada di dataset pemiliknya: fitur salin/duplikat hanya masuk akal untuk pemilik — editor/viewer tidak boleh membuat dashboard di dataset orang lain. <!-- aitk:k date=2026-11-10 task=T-fcar tags=dashboards -->
- Pembaruan latar yang gagal harus terlihat: menyimpan data lama tanpa tanda membuat monitor operasional menampilkan angka basi dengan stempel 'Diperbarui' yang baru — tandai per pemakai hook dan hanya bila data untuk permintaan yang sama memang ada. <!-- aitk:k date=2026-11-10 task=T-nn87 tags=dashboards,ui -->
- Izin tulis harus ikut di WHERE penulisan (updateMany/deleteMany + count), bukan hanya dicek sebelum update by id: status bersama/pribadi bisa berubah di antara keduanya. <!-- aitk:k date=2026-11-10 task=T-tf88 tags=dashboards -->
