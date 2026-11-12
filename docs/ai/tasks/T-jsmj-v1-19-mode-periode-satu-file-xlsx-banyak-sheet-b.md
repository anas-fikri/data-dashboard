---
id: T-jsmj
title: 'v1.19: mode periode — satu file xlsx banyak sheet berkolom sama digabung ke satu sheet dataset (periode acak per baris)'
status: in_review
profile: standard
created: "2026-11-11T16:20:11Z"
updated: "2026-11-12T02:13:04Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 741a1556eeb4d17459d06a0358c5482de2b535af
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T01:53:02Z"
      findings: 2
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-12T02:05:10Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-12T02:13:04Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Satu file xlsx dengan N sheet berkolom sama (mis. 7) diunggah ke dataset mode periode → semua baris semua sheet masuk ke satu sheet dataset, tidak ada IGNORED_SHEETS untuk sheet yang cocok
- [ ] Periode tiap baris dari kolom tanggal (periode acak/bercampur antar sheet): setiap periode yang muncul di sheet mana pun diganti utuh oleh gabungan baris semua sheet (aturan kelompok file T-060)
- [ ] Unggah file terpisah (antrean per periode dan kelompok satu periode) tetap berjalan seperti sekarang; gabungan sheet + beberapa file sekaligus jelas aturannya
- [ ] Sheet berkolom beda tetap ditolak/diabaikan dengan pesan jelas; periode dari label (bukan kolom) → semua sheet = satu periode, dijelaskan di layar tinjauan
- [ ] Tinjauan menampilkan sheet mana yang digabung; panduan 15 + Yang baru diperbarui; uji unit + e2e

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T16:20:12Z Permintaan pemilik 2026-11-11: dikerjakan setelah v1.18. Akar masalah: planSheets memasangkan tiap sheet dataset dengan tepat satu sheet file; sisanya IGNORED_SHEETS. Gabung sheet v1.16 (T-0gmm) hanya mode biasa.
