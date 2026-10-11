---
id: T-022
title: Halaman /panduan per peran, kartu mulai, bantuan kontekstual
status: todo
profile: standard
goal: G-4
depends_on:
  - T-021
  - T-016
  - T-008
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:57:00Z"
created_by: claude-code
---

## Objective
/panduan: tab per peran turunan user (admin = isAdmin; owner = punya dataset atau user baru; editor/viewer = share) + role all; daftar artikel published berurutan; render markdown tersanitasi; video; pencarian judul/isi. Kartu 'Mulai di sini' di beranda untuk user baru, hilang setelah artikel pertama ditandai dibaca (GuideRead per user). Tombol bantuan di halaman upload/skema/builder membuka panel samping artikel dengan contextKey cocok.

## Acceptance criteria
- [ ] Given user hanya viewer di satu dashboard, when membuka /panduan, then hanya artikel role viewer dan all tampil; slug artikel role owner menjawab 404
- [ ] Given user baru tanpa dataset dan share, when login pertama, then tab owner dan all tampil dan kartu 'Mulai di sini' muncul; setelah satu artikel ditandai dibaca, kartu hilang
- [ ] Given user di halaman skema, when menekan tombol bantuan, then panel samping menampilkan artikel contextKey schema untuk perannya tanpa meninggalkan halaman
- [ ] Given pencarian 'upload', when dikirim, then hasil hanya artikel yang boleh dilihat user dan mengandung kata itu
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-11T14:49:26Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Sanitasi markdown sama dengan T-020; pencarian isi memakai parameter binding.
