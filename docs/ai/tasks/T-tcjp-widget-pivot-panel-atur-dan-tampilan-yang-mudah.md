---
id: T-tcjp
title: 'Widget pivot: panel atur dan tampilan yang mudah dipahami'
status: todo
profile: standard
created: "2026-10-19T08:26:18Z"
updated: "2026-10-19T09:34:03Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T09:33:57Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-19T09:34:03Z"
      findings: 0
---

## Objective
Panel atur widget Pivot yang mudah dipahami (ringkasan kalimat bentuk tabel, Baris + rincian, Pisahkan per, Nilai, urutan, Total, Subtotal; isian yang bertabrakan dijelaskan dan tidak disimpan) dan tampilan pivot di kartu (kepala, kolom baris, baris Total menempel saat digulir; subtotal/total dibedakan; aksesibel dengan keyboard dan pembaca layar; ponsel gulir horizontal) serta cetak PDF dengan subtotal dan baris Total.

## Acceptance criteria
- [ ] Given editor dashboard memilih jenis widget Pivot, when mengisi Baris, Kolom, dan Nilai lewat panel atur, then pratinjau langsung memperlihatkan bentuk tabel, pilihan yang tidak cocok dijelaskan dengan bahasa sehari-hari, dan widget tersimpan
- [ ] Given pivot tampil di dashboard, when dilihat di desktop dan ponsel, then header baris dan kolom tetap terlihat saat digulir, subtotal dan total dibedakan jelas, angka memakai format yang dipilih, dan tabel bisa dipakai dengan keyboard serta pembaca layar
- [ ] Given dashboard berisi pivot diekspor ke PDF, when PDF dibuka, then pivot tercetak lengkap dengan subtotal dan total

## Risk
- Impact: panel atur pivot (ringkasan kalimat, Baris + rincian, "Pisahkan per", Nilai 1–3, urutan, Total, Subtotal), tampilan pivot di kartu (kepala/kolom baris/baris Total menempel, kelompok/subtotal dibedakan), cetak PDF (baris/kolom yang muat + Total + keterangan). Kartu ponsel 440 px dan ukuran minimum 3×4 seperti tabel. Komponen lain hanya disentuh di titik sambung (widget-config, print-card, widget-body).
- Security (STRIDE): hanya UI; label/angka dirender React sebagai teks (tanpa HTML mentah). Spec dari panel tetap divalidasi server (isian dobel ditolak, panel menjelaskan dan tidak menyimpan).
- Rollback: revert commit (bersama T-686n).
- Validation: tests/components/pivot-ui.test.ts (nilai awal, isian dobel, ringkasan, model tabel 1/2 nilai + subtotal, potong kolom cetak, keterangan cetak, markup scope/sel kosong), e2e pivot.spec.ts AC1–AC3 di 1440 dan 390 px (keyboard gulir, sticky ±1 px, berat huruf subtotal/total, PDF media print), tangkapan layar ditinjau.

## Notes
- Keputusan cetak PDF: seperti tabel (T-018 D8), pivot dicetak sebanyak baris/kolom yang muat utuh di kartu + baris Total selalu ikut + keterangan baris/kolom yang tidak tercetak; data lengkap lewat ekspor CSV/XLSX (T-9bc2).
- Ekspor CSV/XLSX pivot ditolak INVALID di POST /api/exports dan tombolnya disembunyikan sampai T-9bc2.
