---
id: T-069
title: Buat editor field terhitung di panel widget pivot, grafik, dan KPI
status: todo
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ui
depends_on:
  - T-068
created: "2026-10-21T10:24:08Z"
updated: "2026-10-21T10:24:08Z"
created_by: claude-code
---

## Objective
UI untuk menyusun field terhitung tanpa mengetik SQL: pilih ukuran (agregat + kolom), operator, kurung, dan konstanta; pratinjau hasil; dipakai di pivot, bar/line/pie, dan KPI. Lewat rantai frontend-expert, ikon Tabler. Rencana G-7 §3.2.

## Acceptance criteria
- [ ] Given panel widget pivot, when editor klik 'Tambah field terhitung', then penyusun ekspresi menampilkan token (ukuran, + − × ÷, kurung, konstanta) dengan pratinjau teks 'Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan' dan nilai contoh total keseluruhan, tanpa input SQL bebas
- [ ] Given ekspresi tidak lengkap/tidak valid (kurung tak seimbang, operator ganda, ukuran tak cocok tipe), then tombol Simpan nonaktif dan pesan galat Indonesia muncul di dekat token yang salah (aria-describedby), bukan setelah simpan
- [ ] Given field terhitung tersimpan, then dapat dipilih sebagai nilai di pivot, ukuran di bar/line/pie (pai menampilkan peringatan bila hasilnya memuat nilai negatif), dan KPI, dengan format (otomatis/angka/persen/Rupiah) per field
- [ ] Given hanya keyboard dan lebar 360 px, then penyusun bisa dipakai penuh (Tab/Enter/Backspace hapus token), target sentuh ≥ 44 px, tanpa gulir horizontal; /frontend-expert:audit tanpa Critical/High dan blok Conventions check terisi
- [ ] Given e2e terarah (playwright project widget), when editor membuat Margin pada pivot lalu viewer membuka dashboard bersama, then viewer melihat nilai yang sama dan tidak bisa membuka editor ekspresi

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
