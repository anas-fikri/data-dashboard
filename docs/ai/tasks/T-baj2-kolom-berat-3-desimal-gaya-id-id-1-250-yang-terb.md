---
id: T-baj2
title: Kolom berat 3 desimal gaya id-ID ('1,250') yang terbaca US ditandai ambigu
status: in_review
profile: standard
depends_on:
  - T-t1g0
created: "2026-10-17T06:59:24Z"
updated: "2026-10-17T08:31:44Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: d718d43b4325c97ae5c8aba95598d08a50556418
review:
  passes:
    - "n": 1
      by: claude-agent-review
      at: "2026-10-17T08:31:43Z"
      findings: 0
    - "n": 2
      by: claude-confirm-review
      at: "2026-10-17T08:31:43Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 21254
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      [warn] src/components/guides/guide-browse.tsx
      [warn] tests/features/guides/reader.test.ts
      [warn] Code style issues found in 2 files. Run Prettier with --write to fix.
    at: "2026-10-17T08:31:24Z"
    tree: 71cd06cdc68697146e609704efe25a248872d60ba3ac0a6c8cadfb524a254d87
  check_failures: 1
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given CSV yang angkanya hanya berbentuk koma 3 digit tanpa bukti kuat (mis. berat '1,250', '2,500'), when di-ingest, then kolom ditandai penulisan angka ambigu dengan pesan yang menjelaskan kedua tafsiran (1.250 ribuan vs 1,25 desimal)
- [x] Given kolom US dengan bukti kuat ('1,234,567' atau '2,500.75'), when di-ingest, then tidak ditandai

## Risk
Impact: penanda penulisan angka ambigu di skema: kolom US tanpa bukti US kuat yang berisi "1,250" (dan tanpa bilangan bulat pendek "250") kini ditandai dengan pesan yang menjelaskan dua tafsiran (ribuan vs desimal id-ID 3 digit, mis. berat kg); field baru opsional ambiguousKinds di skema kolom. Skema lama tetap memakai pesan lama.
Security (STRIDE): tidak ada permukaan baru (regex konstan di subquery profil yang sudah ada; tanpa input pengguna baru).
Rollback: revert commit; field ambiguousKinds opsional (tanpa migrasi), diabaikan kode lama.
Validation: tes integrasi ingest (berat '1,250' → US + 'koma'; '1,234,567' / '2,500.75' / '250'+'1,500' → tidak ditandai; T-t1g0 ongkos → ['titik','koma']; T-030 omzet tanpa kinds), tes pesan UI empat cabang; review 2 putaran (0 → 0). Diketahui: kolom koma-saja dengan semua nilai ≥ 1.000 tetap ditandai di kedua pilihan locale (by design: data saja tidak bisa membedakan).

## Notes

- 2026-10-17T08:31:44Z AC1: kolom US tanpa bukti kuat berisi '1,250' (tanpa bilangan bulat pendek) ditandai ambiguousKinds ['koma'] dengan pesan '“1,250” dibaca 1.250 (ribuan). Pilih Indonesia bila maksudnya desimal 1,25.' — tes typed.test.ts T-baj2 + schema-locale-ambiguous. AC2: '1,234,567' / '2,500.75' (bukti US kuat) tidak ditandai; '250' + '1,500' juga tidak (cocok ribuan US).
