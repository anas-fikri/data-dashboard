---
id: T-025
title: 'Fondasi UI via frontend-expert: arah desain, token preset, app shell, tema'
status: in_review
profile: standard
goal: G-2
depends_on:
  - T-001
created: "2026-10-11T14:49:24Z"
updated: "2026-10-11T16:25:12Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: e1ff563fd1ec741570e77bee00b65ce59d049f41
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-11T16:19:44Z"
      findings: 19
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-11T16:25:12Z"
      findings: 3
---

## Objective
Jalankan rantai plugin frontend-expert untuk blank canvas: design-direction (tawarkan 2–3 arah ke user: hierarki/densitas/ekspresi untuk dashboard data internal; maks 2 pertanyaan) → design-foundations → tokens (decision tree; preset non-ungu, mis. zinc-blue/slate-cyan/stone-emerald, skor dicatat) → design-typography → app-shell (logo PCP Express, nama brand, utilities: bantuan + tema di topbar sebagai ikon, avatar → menu akun; sidebar collapse ≥768, drawer + backdrop <768; nav ≤7 item: Beranda, Dataset, Dashboard, Panduan, Admin) → responsive → accessibility. Icons: @tabler/icons-react sebagai waiver resmi atas default Reicon (kebijakan project). Hasil: tailwind.config + CSS custom properties dari preset terpilih, komponen shell (AppShell, Topbar, Sidebar, AccountMenu, ThemeToggle, EmptyState, PageHeader, Select kustom), halaman 404/403, docs/ai/design-system.md berisi arah terpilih, preset + skor, blok Conventions check, dan daftar waiver.

## Acceptance criteria
- [x] Given T-001 selesai, when design-direction dijalankan, then 2–3 arah dengan tradeoff dicatat di docs/ai/design-system.md dan satu arah dipilih user sebelum komponen dibuat
- [x] Given preset token terpilih, when komponen shell dibangun, then tidak ada hex mentah di komponen (grep lolos), warna/spasi/radius dari CSS custom properties, dan skor preset tercatat
- [x] Given app shell, when dicek pada lebar 320/768/1024/1440, then tidak ada scroll horizontal, sidebar menjadi drawer + backdrop di <768, tema sebagai ikon di topbar, avatar membuka menu akun, dan CTA utama full-width di <768
- [x] Given semua ikon shell, when diaudit, then semuanya dari @tabler/icons-react size 20 stroke 1.5, tidak ada Reicon/Lucide, dan waiver Icons tercatat di Conventions check
- [ ] Given /frontend-expert:audit atas shell dan halaman 404, when dijalankan, then tidak ada temuan Critical/High dan blok Conventions check lengkap tersimpan di docs/ai/design-system.md

## Risk
Risk level: LOW–MEDIUM (fondasi visual dipakai semua task UI; tidak menyentuh data/auth)
Impact surface: src/styles/tokens.css, src/app/globals.css, src/components/ui/*, src/components/shell/*, src/app/layout.tsx, src/app/(app)/*, not-found, dependency radix-ui/next-themes/@tabler/icons-react.
Security (STRIDE): tidak ada endpoint/aksi tulis baru; getSessionUser() stub mengembalikan null (tidak ada klaim identitas palsu); nav Admin hanya tampil bila isAdmin tetapi otorisasi nyata di server (T-002/T-019); localStorage hanya preferensi UI; tidak ada HTML mentah.
Compatibility: Tailwind 4 (@theme inline, @custom-variant dark); React 19.3 aturan react-hooks baru (tanpa setState-dalam-effect → useSyncExternalStore); Next 16 Image untuk logo PNG.
Failure modes/edge cases: localStorage tidak tersedia (fallback default); hidrasi tema (suppressHydrationWarning di <html>); drawer terbuka saat layar melebar (ditutup via matchMedia); tanpa sesi (tombol Masuk); 404.
Rollback: revert commit T-025; tidak ada migrasi.
Validation: npm run check; e2e tests/e2e/shell.spec.ts (320/768/1024/1440, drawer+backdrop, CTA full-width, collapse persist, tema, 404); grep hex mentah; audit design-reviewer plugin.
Open risks/assumptions: pemilihan arah desain dilakukan AI atas delegasi user (dicatat di design-system.md §1); logo wordmark dipotong untuk mode ciut.

## Notes

- 2026-10-11T16:22:54Z Bukti: docs/ai/design-system.md (3 arah, Token score zinc-blue 24/24, Conventions check, waiver Tabler); arah dipilih AI atas delegasi user 2026-10-11. grep hex mentah di src/components+src/app = 0; ikon lucide/reicon = 0. e2e tests/e2e/shell.spec.ts 10/10 (320/768/1024/1440 tanpa scroll horizontal, drawer+backdrop <768, CTA full-width, collapse persist, tema di topbar, 404). Audit design-reviewer plugin: 0 Critical, 3 High, 7 Medium, 9 Low → semua diperbaiki (commit 0423efd); verifikasi ulang reviewer menyusul.
