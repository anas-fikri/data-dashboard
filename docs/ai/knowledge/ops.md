# Knowledge: ops

- Satu sumber versi = package.json: server membaca lewat src/lib/version.ts (server-only) dan meneruskan ke klien lewat props; cek tag di bash jangan lewat 'docker ps | grep -q' (SIGPIPE+pipefail membuat cek lolos). <!-- aitk:k date=2026-10-21 task=T-066 tags=ops,ui -->
- Gerbang --quick (pakai backup harian) harus dicek ke migrasi terakhir database produksi, bukan ke tag git sebelumnya: rilis yang tidak pernah di-deploy/di-rollback membuat diff antar tag menipu. <!-- aitk:k date=2026-10-23 task=T-qqrd tags=ops -->
- Worker memproses file tak tepercaya: jangan pasang volume berisi rahasia (backup-config); bagikan status lewat volume terpisah yang ditulis service pemilik datanya. <!-- aitk:k date=2026-11-06 task=T-8g53 tags=ops -->
