# Knowledge: ingest

- Commit periode harus menghitung ulang rencana dari manifest aktif di bawah lock dan memeriksa integritas manifest di transaksi yang sama; file aktif yang belum diperiksa sebelum lock berarti 'coba lagi', bukan gagal; file typed versi belum terminal wajib ditahan GC. <!-- aitk:k date=2026-10-20 task=T-052 tags=ingest,data-integrity,api -->
- Perubahan skema dari unggahan periode dibawa di DatasetVersion.periodMeta dan diterapkan pada salinan sheet aktif saat commit hanya bila revisinya sama; kolom absent hanya dinormalkan bila muncul lagi di file, kalau tidak setiap unggahan berikutnya tertahan di pemetaan. <!-- aitk:k date=2026-10-20 task=T-057 tags=ingest,schema,ui -->
