---
id: T-fnvm
title: Migrasi zod 3 → 4 (GHSA-mrhx-c7xc-m3w5, high)
status: todo
profile: standard
created: "2026-10-24T00:31:02Z"
updated: "2026-10-24T00:31:02Z"
created_by: claude-code
---

## Objective
Advisori GHSA-mrhx-c7xc-m3w5 (high, 2026-10-24): zod < 4.6.6 bisa menghabiskan memori saat memvalidasi koleksi berbatas yang sangat besar; semua zod 3.x terdampak, perbaikan hanya di zod 4. Migrasi ±30 file `from "zod"` ke zod ≥ 4.6.7 (pesan galat, `z.record`, `.default`, `error` map, `zod-validation-error` di eslint-plugin-react-hooks hanya dev). Keputusan pemilik 2026-10-24: rilis v1.5.1 (fix gerbang deploy) dulu, zod sesudahnya (v1.5.2). Selama itu `aitk check` merah karena npm audit (prod high); risiko rendah karena body JSON API dibatasi ukurannya sebelum validasi (src/lib/http-body.ts).

## Acceptance criteria

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
