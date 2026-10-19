---
id: T-f4a7
title: 'Filter pivot dinamis: saring nilai baris/kolom dari tabel, bagian Saring, dan klik untuk menyaring widget lain'
status: in_progress
profile: standard
created: "2026-10-19T15:04:54Z"
updated: "2026-10-19T16:24:38Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: a019f8fc8c1ba0ea0c9f9601c5683ba0862b6221
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 107015
    summary: |-
      …"0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-alert-triangle mt-px shrink-0 text-warning" aria-hidden="true"><path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"></path><path d="M12 16h.01"></path></svg><div class="min-w-0 [overflow-wrap:anywhere]"><p>Filter dashboard juga menyaring kolom bernama sama di sheet lain dataset ini; viewer bisa membandingkan hasil widget sheet itu dengan nilai filter.</p><p class="mt-1">Kolom: <bdi class="font-medium">Kota Tujuan</bdi>, <bdi class="font-medium">No Resi</bdi>.</p><p class="mt-1">Sebelum berbagi, ganti nama kolomnya di skema, hapus kolom filternya di <a class="font-medium underline underline-offset-4" data-filter-settings-link="" type="button" href="/dashboards/d1?mode=edit#kolom-filter">pengaturan dashboard (mode edit)</a>, atau matikan “Klik grafik menyaring widget lain” (grafik) / “Klik label menyaring widget lain” (pivot) di pengaturan widget yang memakai kolom itu.</p></div></div></div>"

       ❯ tests/components/sharing-review-r2.test.ts:206:17
          204|     const out = warnings(["Kota Tujuan", "No Resi"]);
          205|     expect(CROSS_FILTER_LABEL).toBe("Klik grafik menyaring widget lain…
          206|     expect(out).toContain(`matikan “${CROSS_FILTER_LABEL}” di pengatur…
             |                 ^
          207|     expect(out).toContain("ganti nama kolomnya di skema");
          208|     expect(out).toContain("hapus kolom filternya di");

      ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


       Test Files  1 failed | 158 passed (159)
            Tests  1 failed | 2063 passed (2064)
         Start at  23:23:18
         Duration  80.14s (tests 77%, import 17%, transform 5%)

          Isolate  159 workers spawned · ~300ms startup each (spawn + environment, per file)
                   at least ~5.00s faster with isolate: false — reuses workers across files instead of one per file
    at: "2026-10-19T16:24:38Z"
    tree: fc359e63e893b6b0cc247a82fa3330407c5ade78559558e66d3aaa284c374d55
  check_failures: 1
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given widget pivot di dashboard, when pembaca membuka menu saring di kepala kolom baris atau kolom pemisah, then bisa mencari dan mencentang nilai yang ditampilkan (seperti filter PivotTable Excel) tanpa mengubah pengaturan widget, dan subtotal serta total mengikuti nilai yang dipilih
- [ ] Given editor mengatur pivot, when menambah bagian Saring (kolom + nilai, seperti Filters di PivotTable), then pivot hanya menghitung baris yang cocok dan pengaturan itu tersimpan
- [ ] Given pivot dengan Klik untuk menyaring widget lain aktif, when pembaca mengklik label baris atau kolom, then widget lain di dashboard tersaring ke nilai itu (filter silang) dan filter itu bisa dihapus dari bilah filter
- [ ] Given saringan pivot aktif, when pivot diekspor CSV/XLSX atau dashboard diekspor PDF, then hasilnya mengikuti saringan yang sama

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
