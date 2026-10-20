# Knowledge: worker

- Byte zip hasil deflate berbeda antar versi Node (zlib) walau isi entri identik — uji determinisme fixture membandingkan isi entri, bukan byte file; Node 22.22 memuat .ts di worker_threads dengan type stripping bawaan sehingga import tanpa ekstensi gagal walau lewat tsx — image produksi Node 22.23.3 lulus. <!-- aitk:k date=2026-10-20 task=T-040 tags=worker,schema -->
