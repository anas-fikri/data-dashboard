# Knowledge: ops

- Satu sumber versi = package.json: server membaca lewat src/lib/version.ts (server-only) dan meneruskan ke klien lewat props; cek tag di bash jangan lewat 'docker ps | grep -q' (SIGPIPE+pipefail membuat cek lolos). <!-- aitk:k date=2026-10-21 task=T-066 tags=ops,ui -->
