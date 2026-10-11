---
id: T-025
title: 'Fondasi UI via frontend-expert: arah desain, token preset, app shell, tema'
status: todo
profile: standard
goal: G-2
depends_on:
  - T-001
created: "2026-10-11T14:49:24Z"
updated: "2026-10-11T14:49:24Z"
created_by: claude-code
---

## Objective
Jalankan rantai plugin frontend-expert untuk blank canvas: design-direction (tawarkan 2–3 arah ke user: hierarki/densitas/ekspresi untuk dashboard data internal; maks 2 pertanyaan) → design-foundations → tokens (decision tree; preset non-ungu, mis. zinc-blue/slate-cyan/stone-emerald, skor dicatat) → design-typography → app-shell (logo PCP Express, nama brand, utilities: bantuan + tema di topbar sebagai ikon, avatar → menu akun; sidebar collapse ≥768, drawer + backdrop <768; nav ≤7 item: Beranda, Dataset, Dashboard, Panduan, Admin) → responsive → accessibility. Icons: @tabler/icons-react sebagai waiver resmi atas default Reicon (kebijakan project). Hasil: tailwind.config + CSS custom properties dari preset terpilih, komponen shell (AppShell, Topbar, Sidebar, AccountMenu, ThemeToggle, EmptyState, PageHeader, Select kustom), halaman 404/403, docs/ai/design-system.md berisi arah terpilih, preset + skor, blok Conventions check, dan daftar waiver.

## Acceptance criteria
- [ ] Given T-001 selesai, when design-direction dijalankan, then 2–3 arah dengan tradeoff dicatat di docs/ai/design-system.md dan satu arah dipilih user sebelum komponen dibuat
- [ ] Given preset token terpilih, when komponen shell dibangun, then tidak ada hex mentah di komponen (grep lolos), warna/spasi/radius dari CSS custom properties, dan skor preset tercatat
- [ ] Given app shell, when dicek pada lebar 320/768/1024/1440, then tidak ada scroll horizontal, sidebar menjadi drawer + backdrop di <768, tema sebagai ikon di topbar, avatar membuka menu akun, dan CTA utama full-width di <768
- [ ] Given semua ikon shell, when diaudit, then semuanya dari @tabler/icons-react size 20 stroke 1.5, tidak ada Reicon/Lucide, dan waiver Icons tercatat di Conventions check
- [ ] Given /frontend-expert:audit atas shell dan halaman 404, when dijalankan, then tidak ada temuan Critical/High dan blok Conventions check lengkap tersimpan di docs/ai/design-system.md

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
