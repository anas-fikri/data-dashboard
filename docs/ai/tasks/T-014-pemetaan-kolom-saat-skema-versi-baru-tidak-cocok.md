---
id: T-014
title: Pemetaan kolom saat skema versi baru tidak cocok
status: todo
profile: standard
goal: G-5
depends_on:
  - T-013
created: "2026-10-11T14:45:09Z"
updated: "2026-10-11T14:49:25Z"
created_by: claude-code
---

## Objective
Versi refresh dengan kolom skema aktif yang tidak ditemukan atau cast < 98% → AWAITING_MAPPING. UI: petakan kolom baru → kolom lama, konfirmasi NULL untuk kolom hilang, kolom baru masuk tersembunyi. Simpan → re-cast typed versi baru dari raw-nya dengan skema hasil pemetaan → READY + aktif. Sampai selesai, versi aktif lama tetap tampil.

## Acceptance criteria
- [ ] Given file baru dengan satu kolom berganti nama, when ingest selesai, then versi AWAITING_MAPPING, dashboard masih menampilkan versi lama, dan UI menunjukkan kolom yang tidak ditemukan
- [ ] Given user memetakan kolom baru ke kolom lama dan menyimpan, when re-cast selesai, then versi READY dan aktif tanpa membaca file asli
- [ ] Given kolom skema aktif hilang di file baru dan user mengonfirmasi NULL, when aktif, then widget yang memakai kolom itu menampilkan nilai kosong, bukan error
- [ ] Given file baru punya kolom tambahan, when aktif, then kolom itu ada di skema sebagai hidden dan bisa ditampilkan dari halaman skema
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
