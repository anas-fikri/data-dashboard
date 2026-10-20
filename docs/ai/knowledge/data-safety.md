# Knowledge: data-safety

- GC berbasis referensi aman bila tiga hal dipegang bersama: aturan hidup yang konservatif (status ≠ FAILED, termasuk versi pembuat yang masih diproses), tenggang waktu sejak tidak dirujuk, dan pemeriksaan ulang rujukan tepat sebelum objek dihapus; jalur kegagalan harus mengubah status lebih dulu (UPDATE berpenjaga) dan menghapus hanya bila peralihan itu berhasil, kalau tidak job yang dinyatakan gagal setelah commit-nya masuk menghapus versi hidup. <!-- aitk:k date=2026-10-19 task=T-038 tags=data-safety,storage -->
