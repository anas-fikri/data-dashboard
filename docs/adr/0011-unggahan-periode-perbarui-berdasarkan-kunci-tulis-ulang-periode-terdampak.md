---
status: proposed
date: 2026-11-12
---

# ADR-0011: Unggahan periode "Perbarui berdasarkan kunci": tulis ulang periode terdampak sebagai kelompok baru

> Status **proposed** bersama rencana `docs/ai/plans/2026-11-12-perbarui-berdasarkan-kunci.md` (T-rbrb, v1.20).

## Context and Problem Statement

Data per periode (ADR-0008) menyimpan satu set segmen Parquet imutabel per periode per sheet data. Unggahan yang
memuat periode yang sudah ada **mengganti periode itu utuh**. Pemilik mengunggah data operasional (mis. Billing)
yang satu bulannya bisa terpecah ke beberapa file/unggahan karena batas baris Excel, dan ingin baris yang sudah ada
**dikoreksi** (kunci sama) sementara baris baru **ditambahkan** — bukan bulan yang sudah lengkap tertimpa sebagian.

Keputusan pemilik (2026-11-12): (1) kolom kunci dipilih pemilik per dataset/sheet data, dinamis; (2) baris dengan
kunci sama yang tanggalnya pindah periode dipindah ke periode barunya (kunci unik di seluruh sheet data); (3) kunci
dobel di file → unggahan ditolak dengan daftar kuncinya.

## Considered Options

1. **Tulis ulang periode terdampak**: periode yang disentuh file (atau yang kehilangan baris karena kuncinya pindah)
   ditulis sebagai kelompok segmen baru (bagian 1 = salinan baris lama yang tidak tertimpa, bagian 2..n = baris file),
   memakai mekanisme kelompok yang sudah ada (groupId/groupPart/groupSize, T-060/T-jsmj).
2. **Lapisan delta + penanda hapus** (segmen tambahan + daftar `_row` terhapus yang dibaca query): tanpa salinan, tetapi
   setiap query/ekspor/recast/integritas harus memahami penanda hapus.
3. **Pindah data periode ke tabel database** (PostgreSQL) dengan UPSERT: bertentangan dengan ADR-0001/0008 (data tabular
   di Parquet), membebani PostgreSQL bersama di olympus.

## Decision Outcome

Chosen option: "1. Tulis ulang periode terdampak", because semua pembaca (query DuckDB, Lihat data, ekspor, recast,
gerbang integritas, Pulihkan periode, riwayat versi) sudah memahami "periode = kelompok segmen", sehingga tidak ada
jalur baca baru. Biayanya menyalin baris lama periode terdampak (mis. ± 150 ribu baris/bulan → detik), bukan seluruh
dataset. Pencarian kunci lama membaca hanya kolom kunci semua segmen sheet data (Parquet kolumnar).

Aturan:
- Kunci = daftar posisi kolom kanonik per sheet data (`Dataset.periodKeys` JSON: lineageId → pos[]); nilai dibandingkan
  sebagai teks ternormal (trim) dari kolom bertipe; kunci kosong → ditolak bersama daftar baris.
- Mode unggah: **Ganti** (perilaku sekarang), **Tambah** (baris file ditambahkan ke periodenya), **Perbarui berdasarkan
  kunci** (bawaan bila sheet data punya kunci). Perbarui: baris lama berkunci sama di periode mana pun dibuang, baris
  file masuk ke periode tanggalnya; baris lama tanpa pasangan tetap.
- Perbarui/Tambah tanpa menyusut dan tanpa kunci dobel → **aktif otomatis** (tidak ada periode yang tertimpa utuh).
- Riwayat versi/Pulihkan tetap per versi: versi sebelum unggahan masih bisa diaktifkan lagi.

### Consequences

* Good, because satu bulan yang terpecah ke beberapa unggahan cukup diunggah berurutan tanpa saling menimpa, dan
  koreksi baris lama berjalan otomatis.
* Good, because tidak ada format penyimpanan baru (kelompok segmen yang sama), rollback image lama tetap membaca data.
* Bad, because periode terdampak disalin ulang setiap unggahan (biaya CPU/disk sebanding ukuran periode itu, bukan nol).
* Bad, because kunci yang salah dipilih pemilik (tidak unik secara bisnis) akan membuang baris lama yang dianggap sama —
  dimitigasi dengan tinjauan pertama, hitungan "diperbarui/ditambah/tetap", dan Pulihkan.
