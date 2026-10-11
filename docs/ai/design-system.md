# Design system — Data Dashboard

Ditetapkan di T-025 lewat rantai plugin frontend-expert (`design-direction → design-foundations → tokens → design-typography → app-shell → components → responsive → accessibility`). Dokumen ini adalah sumber kebenaran visual: setiap task UI merujuk ke sini dan mengisi blok Conventions check-nya sendiri.

## 1. Arah desain (design-direction)

Pemilihan arah didelegasikan user ke AI (instruksi 2026-10-11: "ambil keputusan standar paling ideal dan relevan"). Tiga arah yang dipertimbangkan:

| Arah | Hierarki | Densitas | Ekspresi | Cocok untuk | Risiko |
|---|---|---|---|---|---|
| **A. Workbench ringkas** (dipilih) | Data dan tabel di depan; kromo tenang; satu CTA utama per halaman | Compact (tinggi kontrol 36px, grid 8px) | Restrained (netral + satu aksen biru) | Pemilik/editor yang bekerja lama di skema, builder, filter | Terasa "teknis" bagi viewer kasual → mitigasi: halaman dashboard dan panduan memakai spasi lebih lapang (section gap 24px, KPI besar) |
| B. Eksekutif lapang | Kartu KPI besar, banyak ruang putih | Spacious | Balanced | Viewer eksekutif di layar besar | Builder dan tabel 1 juta baris boros ruang; densitas rendah memperlambat kerja harian |
| C. Hibrida per peran | Dua densitas dipilih per peran | Compact/Comfortable | Restrained | Semua | Dua set komponen = biaya perawatan dan inkonsistensi; berlebihan untuk v1 |

**Keputusan:** A, dengan "mode baca" ringan di halaman dashboard viewer (lihat §6). Alasan: produk ini menggantikan Excel untuk pekerjaan harian; kecepatan memindai angka dan kerapatan informasi lebih penting daripada dramatisasi visual. Inspirasi: Linear (kromo), Stripe Dashboard (tabel dan filter).

## 2. Token (tokens, score path)

### Token score
- Signals: S=`dashboard` D=`compact` E=`restrained` W=`cool` R=`soft` A=`blue` I=`linear`
- Ranked:
  1. tokens/zinc-blue.css — **24/24** — dashboard+compact+restrained+cool+soft+blue+linear semuanya afinitas penuh
  2. tokens/slate-cyan.css — 20/24 — aksen cyan (0) ; selebihnya cocok
  3. tokens/neutral-oklch.css — 18/24 — radius sharp (0), aksen mono (0)
- Chosen: tokens/zinc-blue.css (tidak ada runner-up dalam 2 poin)

Preset disalin ke `src/styles/tokens.css` dengan penyesuaian: `--radius` diberi satuan (0.5rem) plus `--radius-sm/lg`, token `--success`/`--warning` (status ingest), tinggi kontrol `--control-h*` (36/32/44px), dimensi shell (`--sidebar-w` 15rem, `--sidebar-w-collapsed` 3.5rem, `--topbar-h` 3.5rem, `--content-max` 90rem). Pemetaan ke utilitas Tailwind 4 hanya di `src/app/globals.css` (`@theme inline`). Tema gelap = kelas `.dark` di `<html>` (next-themes). **Tidak ada hex mentah di komponen** (`grep -rn "#[0-9a-fA-F]\{3,6\}" src/components src/app --include=*.tsx` harus kosong).

## 3. Tipografi

Satu keluarga: **system-ui stack** (SF Pro / Segoe UI / Roboto) — keputusan sadar: build on-prem tidak boleh bergantung unduhan Google Fonts, dan font sistem mendukung `tnum`. Skala: h1 24/600 (`text-2xl font-semibold tracking-tight`), judul kartu 16/600, body 14/400, caption 12. Angka memakai `tnum` (font-feature-settings) agar kolom angka sejajar. Satu `<h1>` per halaman lewat `PageHeader`.

## 4. App shell

- Topbar 56px: burger (<768) · brand (ponsel) · utilities kanan: **Panduan (ikon)** · **tema (ikon, bukan tombol berlabel di sidebar)** · **avatar → menu akun** (nama/email di dalam menu; saat belum login: tombol "Masuk").
- Sidebar ≥768: rail 240px, bisa diciutkan ke 56px ikon saja (preferensi diingat di localStorage `dd.sidebar.collapsed`); <768: drawer 288px + backdrop (Radix Dialog: fokus terkunci, Esc menutup), menutup otomatis saat navigasi dan saat layar melebar.
- Navigasi 5 item (≤7): Beranda, Dataset, Dashboard, Panduan, Admin (hanya `isAdmin`). Active state: latar aksen + warna primer + `aria-current="page"`.
- Landmark: `<a href="#konten">` skip link, `<aside>`, `<header>`, `<main id="konten">`.
- 404 (`not-found.tsx`) juga dipakai untuk objek yang tidak boleh diakses (D2).

Logo: wordmark PCP Express 200×30 (`public/brand/pcp-logo.png`, dari project ictnotesv2) dengan varian tema gelap `pcp-logo-dark.png` ("PCP" diputihkan, "EXPRESS" tetap merah). Tanda persegi `mark.png`/`mark-dark.png` (glyph "P" dipotong presisi) dipakai di rail ciut, topbar ponsel (bersama teks "Data Dashboard" di ≥360px), dan favicon.

## 5. Komponen dasar (`src/components/ui`)

`Button` (variants primary/secondary/outline/ghost/destructive/link; size sm/md/lg/icon*; `pending` menukar ikon awal dengan spinner tanpa menggeser label; `asChild`), `Input`, `Field` (label + hint/error dengan aria), `Select` kustom (Radix; caret tidak menempel tepi), `DropdownMenu`, `Avatar` (inisial), `Card*`, `EmptyState` (ikon 28px + judul dengan elemen `as` h1/h2/p + penjelasan + aksi; `bare` di dalam Card agar tidak ada bingkai ganda), `PageHeader` (h1 + deskripsi + aksi; aksi full-width <640).

Geometri kontrol: tinggi dari token, slot ikon tetap 20px (`[&_svg]:size-5 shrink-0`), gap 8px, radius `--radius`. Varian yang wajib dicek saat menambah kontrol baru: teks saja, ikon depan, ikon belakang, ikon saja, pending, disabled, fokus.

## 6. Responsif dan densitas

Mobile-first; dicek 320/768/1024/1440 (e2e `tests/e2e/shell.spec.ts`). CTA utama `w-full sm:w-auto` di bawah 640. Input dan Select memakai `text-base md:text-sm` (16px di ponsel agar iOS tidak zoom, 14px di desktop). Tabel lebar → scroll horizontal di dalam kontainer tabel, bukan halaman. Halaman dashboard (viewer) memakai `gap-6` antar widget dan KPI 32px; halaman kerja (skema, builder) memakai `gap-4`.

## 7. Aksesibilitas

Target WCAG 2.2 AA. Fokus terlihat global (`:focus-visible` outline ring 2px). Ikon dekoratif `aria-hidden`; tombol ikon punya `aria-label`. Status tidak hanya warna (teks OK/Gagal + ikon). Kontras terukur setelah koreksi audit T-025: light `--primary` 221 83% 53% (#2563eb) → putih di atasnya 5,2:1; dark `--primary` 217 91% 60% dengan `--primary-foreground` gelap 4,9:1; nav aktif memakai `text-sidebar-accent-foreground` (ikon saja berwarna primer); `--destructive` light 0 72% 51% (4,8:1 sebagai teks) / dark 0 84% 68%; `--input` 240 4% 58% (light) dan 240 5% 42% (dark) agar batas kontrol ≥ 3:1 (1.4.11); overlay drawer memakai token `--overlay`. Skip link memindahkan fokus ke `<main tabIndex={-1}>`. `prefers-reduced-motion` mematikan transisi.

## 8. Waiver dan Conventions check (T-025)

```markdown
## Conventions check
- Tokens: tokens/zinc-blue.css (score 24/24) → src/styles/tokens.css
- Icons: existing lib: @tabler/icons-react (size 20, stroke 1.5) — waiver atas default Reicon (kebijakan project)
- Audit: design-reviewer plugin 2026-10-11 → 0 Critical, 3 High, 7 Medium, 9 Low; semuanya diperbaiki (lihat task T-025 notes)
- States: loading / empty / error covered? yes (EmptyState, Button pending, Field error; data states per task)
- Responsive: 320/768/1024/1440 checked | full-width CTA <768 (e2e shell.spec.ts)
- Hierarchy: pass (satu h1 via PageHeader, satu CTA utama per halaman)
- Typography: one h1 + ladder (system-ui; 24/16/14/12; 404 memakai h1 via EmptyState as="h1")
- A11y: labels + focus noted? yes (skip link, aria-label ikon, focus-visible, Radix Dialog/Menu)
- WebGL: n/a
- Shell: logo + utilities + theme-in-topbar | avatar→menu | drawer+backdrop <768 | collapse ≥768
- Landing: n/a app-shell
- Motion: light shell (transisi warna 150ms; reduced-motion dihormati) | tidak ada animasi dekoratif
- Design domains: typography / color / surfaces applied
- Foundations: container max 90rem, grid 8px, section gap 16/24, satu focal path per halaman
- Control geometry: radius token + slot ikon tetap + pending/disabled/focus dicek pada Button
```

Waiver tetap: **Icons = Tabler** (Reicon/Lucide tidak dipakai; Lucide hanya bila Tabler tidak punya glyph, tidak dicampur dalam satu komponen).
