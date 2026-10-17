# Image backup (T-023): pg_dump/pg_restore (klien 16, kompatibel server 14–16), rclone (salinan bucket +
# off-VM), age (enkripsi kunci publik), cron busybox. Skrip di-mount dari deploy/backup.sh / restore.sh.
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
RUN apk add --no-cache bash coreutils tar postgresql16-client rclone age tzdata curl
ENV TZ=Asia/Jakarta
# BACKUP_SCHEDULE (cron, bawaan 02:00 WIB) dibaca saat start.
CMD ["sh", "-c", "echo \"$BACKUP_SCHEDULE /usr/local/bin/backup.sh >>/proc/1/fd/1 2>&1\" > /etc/crontabs/root && exec crond -f -l 8"]
