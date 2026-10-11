---
id: T-006
title: Halaman review & koreksi skema kolom
status: todo
profile: standard
goal: G-3
depends_on:
  - T-005
created: "2026-10-11T10:22:45Z"
updated: "2026-10-11T10:22:45Z"
created_by: claude-code
---

## Objective
Setelah ingest, user melihat per sheet: nama kolom, tipe terdeteksi, 50 baris sampel, statistik null/unik. User bisa rename kolom, ubah tipe (teks→angka/tanggal dengan format), tandai kolom sebagai dimensi/ukuran, sembunyikan kolom. Perubahan memicu re-cast Parquet.

## Acceptance criteria
- [ ] Given ingest selesai, when user membuka tab skema, then setiap sheet menampilkan kolom, tipe, persentase null, dan 50 baris sampel
- [ ] Given kolom teks berisi tanggal format dd-mm-yyyy, when user mengubah tipe ke tanggal dengan format tersebut, then kolom ter-cast dan baris yang gagal parse dilaporkan jumlahnya
- [ ] Given user mengganti nama kolom, when menyimpan, then nama baru dipakai di seluruh builder dan nama asli tetap tersimpan sebagai sumber

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
