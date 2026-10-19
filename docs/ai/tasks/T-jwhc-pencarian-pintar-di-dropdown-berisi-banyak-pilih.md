---
id: T-jwhc
title: Pencarian pintar di dropdown berisi banyak pilihan
status: todo
profile: standard
created: "2026-10-19T09:11:11Z"
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
Dropdown berisi banyak pilihan (≥ 8: kolom dataset, sheet, dataset di form buat dashboard) punya kotak cari pintar yang langsung fokus: tidak peka huruf besar/aksen, cocok per kata/awalan/singkatan/inisial, hasil disorot dan diurutkan, bisa dipakai penuh dengan keyboard dan pembaca layar; dropdown pendek tetap daftar biasa.

## Acceptance criteria
- [ ] Given dropdown berisi banyak pilihan (mis. kolom dataset, sheet, dataset), when dibuka, then ada kotak cari yang langsung fokus dan daftar tersaring saat mengetik tanpa peka huruf besar/kecil dan aksen, cocok per kata, awalan, maupun singkatan (mis. 'tgl krm' menemukan 'Tanggal Kirim'), dengan bagian yang cocok disorot
- [ ] Given hasil pencarian, when memakai keyboard (panah, Enter, Escape) atau pembaca layar, then pilihan bisa dipilih tanpa mouse, jumlah hasil diumumkan, dan pesan jelas tampil bila tidak ada yang cocok
- [ ] Given dropdown pendek (mis. format angka, desimal), when dibuka, then tetap daftar biasa tanpa kotak cari

## Risk
- Impact: Choice (panel widget) dengan ≥ 8 pilihan dan pemilih dataset di form buat dashboard (≥ 8 dataset) memakai SearchSelect (Popover modal + kotak cari + listbox); daftar pendek tetap Radix Select. Pola klik label → pilih option sama, e2e lama tetap jalan. Pemilih pemetaan kolom (mapping-picker) belum diubah.
- Security (STRIDE): hanya UI klien; nilai terpilih dikirim seperti sebelumnya (server tetap memvalidasi); label dirender sebagai teks.
- Rollback: revert commit; Choice kembali ke Radix Select.
- Validation: tests/lib/search.test.ts (huruf besar/aksen, singkatan, inisial, peringkat, emoji, sorotan, ambang SEARCH_MIN), e2e pivot.spec.ts (ketik di pemicu, singkatan "tgl krm", panah+Enter, Escape → fokus ke pemicu, jumlah hasil diumumkan, lembar Dialog ponsel: fokus, huruf ≥ 16 px, gulir roda), e2e widgets/kpi-fit/chart-polish/dashboards sebagai regresi.

## Notes
- Belum dipakai: pemilih pemetaan kolom (mapping-picker: item dua baris + pilihan nonaktif) — kandidat lanjutan bila kolom file sangat banyak.
- aria-selected mengikuti opsi aktif (pola aria-activedescendant); nilai terpilih terbaca dari teks pemicu.
