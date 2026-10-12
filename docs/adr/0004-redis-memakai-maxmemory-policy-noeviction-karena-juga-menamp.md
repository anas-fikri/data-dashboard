---
status: accepted
date: 2026-10-12
---

# ADR-0004: Redis memakai maxmemory-policy noeviction karena juga menampung antrean BullMQ

## Context and Problem Statement

Satu instance Redis dipakai untuk rate limit, cache hasil query (T-009), dan antrean BullMQ (ingest T-004/T-006, maintenance). Compose dev semula memakai `maxmemory 256mb` + `allkeys-lru` (dari flow-kerja C). Saat worker pertama dijalankan (T-004), BullMQ memperingatkan: "Eviction policy is allkeys-lru. It should be noeviction". Dengan LRU, saat memori penuh Redis bisa membuang key job, data job, atau lock worker secara diam-diam: job ingest hilang tanpa jejak atau diproses ganda.

## Considered Options

* `allkeys-lru` (semula): cache terkelola otomatis, tetapi antrean bisa kehilangan job.
* `volatile-lru`: hanya key ber-TTL yang dibuang; lock BullMQ ber-TTL sehingga tetap bisa terbuang (job dianggap stalled dan diulang).
* `noeviction`: tidak ada key yang dibuang; tulis gagal (OOM) saat memori penuh.
* Dua instance Redis (cache LRU + antrean noeviction): paling bersih, tetapi menambah satu layanan on-prem.

## Decision Outcome

Chosen option: "noeviction", because BullMQ mensyaratkannya dan kehilangan job lebih mahal daripada cache yang tidak tersimpan. Satu instance tetap cukup untuk skala on-prem ini.

### Consequences

* Good, because job dan lock antrean tidak pernah terbuang; perilaku antrean deterministik.
* Good, because tidak menambah layanan.
* Bad, because cache tidak lagi dibatasi otomatis: setiap key cache wajib ber-TTL (24 jam) dan berukuran terbatas (hasil ≤ 10k baris), dan SET yang gagal OOM wajib diperlakukan sebagai cache miss (T-009).
* Bad, because rate limit ikut gagal saat Redis penuh; `maxmemory` harus diukur di T-024 dan dipantau (T-023). Bila cache tumbuh melebihi perkiraan, pecah ke instance Redis kedua (opsi keempat).
