# Rencana: monitor sumber daya server di sidebar (v1.18)

Permintaan pemilik (2026-11-11): grafik pemakaian server di sidebar — CPU, RAM, jaringan, storage — plus pemakaian
per akun yang sedang login secara realtime. Pemicu nyata hari yang sama: insiden load 211 (penyebab tak terlihat)
dan worker mati > 3 jam tanpa ada yang tahu.

Keputusan pemilik (2026-11-11):

| # | Pertanyaan | Keputusan |
|---|---|---|
| K1 | Siapa yang melihat grafik server | **Semua user login** (ringkasan). Asumsi aman: detail per layanan dan per akun **admin saja** (aktivitas user lain tidak dibuka ke semua user). |
| K2 | Sumber data seluruh host | **node_exporter** (container baru di proyek compose `dashboard`) |
| K3 | Pemakaian per akun | **Perkiraan** cukup (CPU per user tidak bisa diukur persis) |

## Arsitektur

```
host olympus ──/proc,/sys (ro)──▶ node-exporter (network host, 127.0.0.1:9100)
                                     ▲
                metrics-relay (socat, network host, 172.17.0.1:19100, range=APP_SUBNETS) — pola pg-relay
                                     ▲
app (Next.js) ── sampler 10 dtk (instrumentation.register, kunci Redis agar satu sampler) ──▶ Redis
   │                 ├─ host: CPU %, load, RAM/swap, disk (/ dan root Docker), jaringan ↓↑ (antarmuka fisik)
   │                 ├─ antrean ingest: menunggu/berjalan + jumlah worker (ingestWorkerCount v1.17.1)
   │                 └─ riwayat: 10 dtk × 1 jam (360 titik) + 1 menit × 24 jam (1.440 titik)
   ├─ GET /api/metrics/summary  (user login)   → titik terakhir + 1 jam (± 60 titik) + status pemroses
   └─ GET /api/admin/metrics    (admin)        → + 24 jam, per layanan, per akun
app & worker ── cgroup sendiri (cpu.stat, memory.current/max) tiap 10 dtk ──▶ Redis (TTL 30 dtk)
```

- **node-exporter**: image resmi `prom/node-exporter` dipin digest; `network_mode: host`, `pid: host`,
  `/:/host:ro,rslave`, `--path.rootfs=/host`, hanya mendengar `127.0.0.1:9100`; read_only, cap_drop ALL,
  no-new-privileges. Kolektor yang dipakai: cpu, loadavg, meminfo, filesystem, netdev, diskstats (sisanya mati).
  Biaya: ± 15–25 MB RAM, CPU diabaikan.
- **metrics-relay**: sama persis dengan `pg-relay` (socat, sumber dibatasi `APP_SUBNETS`): container aplikasi
  lain di VM bersama tidak bisa membaca metrik.
- **Sampler** di proses app (bukan worker — harus tetap jalan saat worker mati). Kunci `SET NX` Redis TTL 15 dtk:
  hanya satu sampler walau app lebih dari satu proses. `METRICS_NODE_URL` kosong (dev/CI) → sampler mati, panel
  menampilkan "Data server belum tersedia".
- **Per layanan**: app dan worker menulis pemakaian cgroup v2 sendiri (tanpa docker.sock — tidak memberi akses root).
- **Per akun (perkiraan, admin)**: query berjalan + detik query 15 menit terakhir per user (dicatat QueryEngine ke
  Redis per menit), job berjalan (unggahan/ingest, ekspor, PDF) per pemilik, kuota storage terpakai.

## Tampilan

- **Sidebar (semua user login)**: kartu ringkas CPU %, RAM %, disk %, jaringan ↓↑ dengan sparkline 1 jam (SVG
  sendiri, tanpa pustaka grafik baru), titik status "Pemroses unggahan aktif/tidak aktif" + jumlah antrean.
  Sidebar diciutkan → satu ikon berwarna status. Polling 10 dtk, berhenti saat tab tidak terlihat. Warna ambang:
  CPU > 85 % (5 menit), RAM > 90 %, disk > 85 %.
- **Admin › Sumber daya**: grafik 1 jam / 24 jam, tabel per layanan (app, worker), tabel per akun, catatan cara
  membaca. Bahasa awam, ikon Tabler.

## Keamanan

- Metrik host hanya di 127.0.0.1 + relay bersumber subnet aplikasi; API butuh login; per akun/per layanan admin saja.
- API tidak memuat nama host, IP, nama antarmuka, nama proses, atau email user lain (selain tabel admin).
- Tanpa docker.sock. Image dipin digest.

## Fase dan task

1. **v1.18.0 — fase 1**: node-exporter + relay + sampler + API ringkas + kartu sidebar + halaman admin (host,
   layanan, pemroses/antrean). Runbook §29 (pasang, verifikasi, rollback: hapus service, data Redis hilang sendiri).
2. **v1.18.0 — fase 2**: tabel per akun (admin).
3. **Lanjutan (gabung T-r5tm)**: peringatan email bila worker mati > 5 menit / disk hampir penuh — dikirim app,
   bukan worker. Menunggu SMTP produksi diperbaiki (login ditolak 535 sejak 2026-11-11).

## Uji

- Unit: parser format teks Prometheus (fixture nyata node_exporter), hitung laju dari dua sampel (counter reset),
  agregasi 1 menit, filter antarmuka jaringan, kunci sampler.
- e2e: server metrik palsu (fixture) → kartu sidebar menampilkan angka + sparkline; non-admin tidak bisa membuka
  API admin (403/404); tanpa sumber → "Data server belum tersedia".

## Risiko

- `network_mode: host` + `pid: host` untuk node-exporter: hanya baca (rootfs ro, cap_drop ALL); port tidak terbuka
  ke luar host. Rollback: hapus dua service dari compose, `up -d --remove-orphans`.
- Sampler gagal (relay mati) → titik kosong, panel memberi tahu; tidak mempengaruhi halaman lain.
