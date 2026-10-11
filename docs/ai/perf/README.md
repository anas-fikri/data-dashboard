# Bukti performa

Satu file per task yang punya AC performa (T-005, T-006, T-009, T-011, T-024): `T-xxx.md`.
Isi minimal: tanggal, commit, spek mesin, fixture (parameter `scripts/make-fixture.ts`), perintah `npm run perf -- <skenario>`, hasil (waktu, puncak RSS, p50/p95), lolos/tidak terhadap target, catatan.
`npm run check` tidak pernah menjalankan skenario di sini.
