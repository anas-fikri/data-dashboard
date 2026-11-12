---
status: proposed
date: 2026-11-11
---

# ADR-0010: Monitor sumber daya: node_exporter host-only lewat relay subnet, sampler di app ke Redis

> Status **proposed** 2026-11-11 bersama rencana `docs/ai/plans/2026-11-11-monitor-sumber-daya.md`. Menjadi
> accepted setelah fase 1 (v1.18.0) terpasang di produksi tanpa mengubah keputusan di bawah.

## Context and Problem Statement

Pemilik ingin grafik CPU, RAM, jaringan, dan storage server di sidebar, plus perkiraan pemakaian per akun. Hari
yang sama terjadi dua insiden yang tidak terlihat dari aplikasi: load 211 (server di-reboot, penyebab tidak
diketahui) dan worker mati > 3 jam sehingga impor menunggu tanpa kabar. Olympus adalah VM bersama (8 vCPU, RAM
15 GiB) dengan aplikasi lain; container dashboard tidak boleh menyentuh container lain, dan PostgreSQL berjalan di
host (diakses lewat relay `pg-relay` yang hanya menerima subnet aplikasi).

Container biasa hanya melihat jaringan dan pemakaian cgroup-nya sendiri; angka seluruh host (CPU, RAM, disk,
jaringan fisik) butuh `/proc` dan `/sys` host.

## Considered Options

1. **node_exporter** (host network + pid host, rootfs ro) yang hanya mendengar 127.0.0.1, dibaca app lewat relay
   socat bersumber subnet aplikasi (pola `pg-relay`); sampler di proses app menyimpan riwayat di Redis.
2. Prometheus + Grafana lengkap (scrape + TSDB + dashboard tersemat).
3. Mount `/var/run/docker.sock` ke app untuk `docker stats`.
4. Mount `/proc` host ke container app dan membacanya sendiri.
5. Hanya cgroup container dashboard sendiri (tanpa angka host).

## Decision Outcome

Chosen option: "1. node_exporter host-only lewat relay subnet + sampler di app ke Redis", because ia memberi
angka seluruh host yang akurat dengan format standar (bisa dibaca Prometheus nanti tanpa perubahan), tanpa memberi
container aplikasi akses root (docker.sock), dengan biaya ± 20 MB RAM, dan memakai pola isolasi jaringan yang
sudah diterima di proyek ini (`pg-relay`). Prometheus/Grafana penuh (2) terlalu berat untuk kebutuhan 1 jam/24 jam
dan menambah UI terpisah; docker.sock (3) setara root host; mount `/proc` ke app (4) melebarkan permukaan serang
proses web yang menerima input user; cgroup saja (5) tidak menjawab "kenapa server berat" (aplikasi lain di VM).

Sampler berjalan di proses app (instrumentation), bukan worker, karena worker justru salah satu yang dipantau
(boleh mati); kunci Redis `SET NX` menjamin satu sampler. Riwayat: 10 dtk × 1 jam + 1 menit × 24 jam di Redis
(± 0,5 MB). Ringkasan host boleh dilihat semua user login (keputusan pemilik); per layanan dan per akun admin saja.

### Consequences

* Good, because insiden seperti load tinggi dan worker mati langsung terlihat di sidebar, dan admin bisa melihat
  layanan/akun mana yang berat tanpa SSH.
* Good, because format Prometheus: Prometheus/Grafana bisa ditambahkan kemudian tanpa mengganti exporter.
* Bad, because dua container baru (node-exporter, metrics-relay) dengan `network_mode: host`; node-exporter juga
  `pid: host` (baca-saja, cap_drop ALL) — menambah hal yang harus dipahami saat audit VM bersama.
* Bad, because riwayat hanya 24 jam dan hilang bila Redis di-reset; bukan pengganti monitoring infrastruktur penuh.
* Bad, because pemakaian per akun hanya perkiraan (waktu query, job berjalan), bukan CPU/RAM per user.
