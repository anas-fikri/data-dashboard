---
id: T-rbrb
title: 'v1.19: mode periode — periode yang sudah ada bisa Ganti / Tambah baris / Perbarui berdasarkan kunci (upsert), bukan han…'
status: in_review
profile: standard
created: "2026-11-11T16:33:38Z"
updated: "2026-11-12T07:02:36Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 65747109ec59df6b0e53715f3d93fa0a2d258f9e
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T07:02:20Z"
      findings: 13
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-12T07:02:21Z"
      findings: 8
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Per unggahan (atau per periode di layar tinjauan) pilih: Ganti utuh (sekarang), Tambah (baris file ditambahkan ke periode), atau Perbarui berdasarkan kunci (baris berkunci sama diganti versi file, kunci baru ditambah, baris lama yang tidak ada di file tetap)
- [ ] Kunci = satu/lebih kolom pilihan pemilik per dataset (mis. No. Resi); kunci kosong/duplikat di file dilaporkan di tinjauan sebelum diterapkan
- [ ] Tinjauan menampilkan per periode: diperbarui N, ditambah N, tetap N (bukan hanya Sekarang/Setelah)
- [ ] Tidak ada periode yang menyusut tanpa sengaja: periode yang datanya lebih sedikit dari sekarang bisa dikecualikan dari unggahan di layar tinjauan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-11-11T16:33:39Z Permintaan pemilik 2026-11-11 (tangkapan layar tinjauan: April 2026 115.741 → 34.024 'Diganti'). Butuh keputusan desain: cakupan kunci (per periode vs seluruh dataset — baris yang tanggalnya pindah periode), aturan duplikat, ADR baru. Dikerjakan setelah v1.18 bersama T-jsmj.
- 2026-11-12T01:14:52Z Keputusan pemilik 2026-11-12: (1) kunci dinamis — pemilik memilih satu/lebih kolom kunci per dataset sesuai kebutuhan, tidak dikhususkan untuk dataset tertentu; (2) baris dengan kunci sama yang tanggalnya pindah periode DIPINDAH ke periode baru (kunci berlaku seluruh dataset, tidak dobel); (3) kunci dobel di file → unggahan ditolak dengan notifikasi berisi daftar kunci/baris yang dobel.
- 2026-11-12T01:35:39Z AC4 (periode menyusut bisa dikecualikan di tinjauan) dikerjakan terpisah di T-aavf (v1.19). Tambah/Perbarui berdasarkan kunci → v1.20 (butuh ADR + migrasi kolom kunci).
- 2026-11-12T05:42:41Z Rencana docs/ai/plans/2026-11-12-perbarui-berdasarkan-kunci.md + ADR-0011 (proposed): tulis ulang periode terdampak sebagai kelompok baru; Dataset.periodKeys; mode REPLACE/APPEND/UPSERT; K4 tanpa konfirmasi bila bersih.
- 2026-11-12T07:02:36Z Implementasi v1.20 (ADR-0011 accepted): migrasi period_keys; keyMerge + pemadatan salinan; mode REPLACE/APPEND/UPSERT di unggah tunggal + antrean; kolom kunci di Atur periode; tinjauan UPDATED + hitungan. Review 1: 0 blokir/13 (M1–M4 + L5/L8 diperbaiki); review 2: 0 blokir/8 (M1, L3, L4, L5 diperbaiki). Sisa → T-yg3z. AC1 per unggahan (bukan per periode di tinjauan); AC2 kunci dobel/kosong ditolak dengan daftar sebelum tinjauan (keputusan pemilik K3); AC4 lewat T-aavf.
