# Knowledge: deploy

- Docker bind mount satu file (./deploy/x.sh:/usr/local/bin/x.sh) menunjuk inode saat container dibuat: sinkron kode yang mengganti file (git archive | tar -x, editor yang rename) membuat container lama tetap menjalankan isi lama dan compose up tidak mendeteksinya — deploy.sh wajib force-recreate service yang me-mount file (proxy, backup); bandingkan sha256 host vs container saat ragu. PostgreSQL host olympus ber-encoding SQL_ASCII (cluster locale C): CREATE DATABASE wajib ENCODING UTF8 TEMPLATE template0. <!-- aitk:k date=2026-10-17 task=T-023 tags=deploy,security -->
