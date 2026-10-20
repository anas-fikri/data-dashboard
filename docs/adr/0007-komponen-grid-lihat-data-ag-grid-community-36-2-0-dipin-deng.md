---
status: proposed
date: 2026-10-17
---

# ADR-0007: Komponen grid "Lihat data": AG Grid Community 36.2.0 (dipin) dengan mitigasi stretching

> **Status `proposed`.** ADR ini baru menjadi `accepted` setelah gerbang pembaca layar (NVDA/VoiceOver) di T-043
> lolos. Spike T-035 tidak memverifikasi pembaca layar; verifikasi itu ditunda ke gerbang a11y T-043 (delegasi tetap
> user).

## Context and Problem Statement

Rencana `docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md` §3 membutuhkan penampil baca-saja "Lihat data"
bergaya Excel untuk sheet sampai 10 jt baris (blok 200 baris dari server, header beku, kolom nomor baris beku,
urut/saring di server, salin ke Excel, WCAG 2.2 AA, CSP T-027, rute lazy ≤ 300 KB gzip = 293 KiB). Tinggi model
10 jt × 32 px = 320 jt px jauh di atas batas tinggi elemen browser (Chromium/WebKit 33.554.428 px; Firefox ± 17,9 jt
px), jadi grid harus "meregangkan" (stretching) atau memakai paging blok.

Spike T-035 (laporan `docs/ai/perf/T-035.md`, bukti `docs/ai/perf/T-035/`) menguji dua kandidat di React 19.3.0
(Vite 8 dan Next 16.4.0) pada Chromium 156, WebKit 27.2, dan Firefox 157 dengan data sintetis 10 jt baris. Temuan
utama (wheel/trackpad = min/median/maks baris per 100 px, 12 langkah):

* AG Grid Community 36.2.0 (Infinite Row Model) meregang dengan wadah 32 jt px (Chromium/WebKit) dan **4 jt px di
  Firefox** (rasio 10× / 80×; stretching aktif mulai 125 rb baris di Firefox). Tanpa mitigasi: seret ke akhir tidak
  menampilkan baris terakhir penuh di 3 engine (thumb sungguhan Chromium: 6/6 berhenti di 9.999.994); wheel 31/31/32
  (Chromium, WebKit) dan 250/250/251 (Firefox); `ensureIndexVisible(i,'top')` meleset 3–30 px; keyboard dalam dari
  baris 5 jt kadang meninggalkan baris terfokus di luar layar (Firefox: ± 26.000 px, 2 dari 28 langkah); usapan
  sentuh 300 px = 91–93 baris.
* Glide Data Grid 6.0.4-alpha24 memetakan delta kecil 1:1 dan lompatan besar per persentase: wheel/trackpad 3/3/4 dan
  sentuh 9–10 baris per 300 px, seret ke akhir benar di Chromium/WebKit, keyboard dalam benar di 3 engine. Tetapi `scrollTo()` bawaan
  rusak di atas ± 1 jt baris (Ke baris 5.000.000 mendarat di baris 1), baris terakhir terpotong di Firefox,
  aksesibilitas berbasis kanvas + tabel tersembunyi (tanpa `aria-sort`, teks tidak di DOM), tanpa urut/saring, dan
  React 19 hanya ada di versi alpha tanpa rilis npm sejak 2025-10-08.
* Keduanya: 0 pelanggaran CSP T-027 di 3 engine; tema token terang/gelap tepat; ikon Tabler bisa dipakai; salin sel
  ke clipboard benar di 3 engine. Chunk rute (KiB gzip): AG 214,7 (Vite, 8 modul), 235,9 (Next Turbopack, 8 modul),
  263,0 (Next Turbopack, set modul perkiraan T-043); Glide 99–103.

## Considered Options

* **AG Grid Community 36.2.0** (`ag-grid-community` + `ag-grid-react`, MIT), Infinite Row Model, modul dipilih
  satu per satu, plus mitigasi stretching kita sendiri.
* **Glide Data Grid 6.0.4-alpha24** (`@glideapps/glide-data-grid`, MIT), grid kanvas, plus `scrollTo` sendiri, baris
  sentinel, header dan UI urut/saring sendiri.
* **TanStack Virtual 3.14.13 + paging blok** (`@tanstack/react-virtual`, MIT): virtualisasi sendiri, blok 50 rb baris
  (1,6 jt px, di bawah batas semua browser → tanpa stretching), semua fitur grid dibangun sendiri.
* (Ditolak di rencana §3.3, tidak diuji ulang: AG Grid Enterprise, Handsontable, Univer/FortuneSheet, Luckysheet,
  react-data-grid, RevoGrid.)

## Decision Outcome

Chosen option: "**AG Grid Community 36.2.0**", because aksesibilitasnya berbasis DOM nyata (`role=grid`,
`aria-rowcount`, `aria-rowindex` benar sampai baris terakhir, `aria-sort`, fokus di sel DOM) sesuai gerbang WCAG 2.2
AA rencana §3.7; urut, resize, geser, kolom beku, tooltip, dan header kustom sudah tersedia di Community; dan
pemeliharaannya aktif dengan dukungan React 19 resmi. Kegagalan AC 1 yang ditemukan tertutup oleh empat mitigasi kecil
yang **sudah diuji bersama** di prototipe Vite pada 3 engine (lihat "Status mitigasi"); sisanya menjadi persyaratan
T-043. Glide unggul di mekanika gulir dan ukuran bundel, tetapi kelemahannya (aksesibilitas kanvas, pemeliharaan
alpha-only, tanpa urut/saring) tidak bisa kita perbaiki sendiri.

Rincian yang diputuskan bersama:

* **Versi dipin persis** di `package.json` (tanpa `^`): `ag-grid-community@36.2.0`, `ag-grid-react@36.2.0`
  (menarik `ag-stack@36.2.0`, `ag-charts-types@14.2.0`). Upgrade hanya lewat task tersendiri yang menjalankan ulang
  e2e grid di Chromium, WebKit, dan Firefox (lihat Kriteria fallback).
* **Modul**: didaftarkan statis satu per satu di modul rute grid. Set yang diperkirakan untuk T-043:
  `InfiniteRowModelModule`, `ScrollApiModule`, `RowApiModule`, `ColumnApiModule`, `ColumnAutoSizeModule`,
  `TooltipModule`, `CellStyleModule`, `LocaleModule`, `RowSelectionModule`, `CustomFilterModule`,
  `ExternalFilterModule`, `CellApiModule`, `RenderApiModule`, `EventApiModule`, `DragAndDropModule`, `PinnedRowModule`.
  Terukur: 243,6 KiB (Vite) dan **263,0 KiB di Next Turbopack** sebelum UI app — sisa ± 30 KiB sampai 293 KiB. Jangan
  pernah merujuk `AllCommunityModule`, termasuk di cabang mati berbasis env: Turbopack tidak membuangnya (325,1 KiB).
* **Rute**: `/datasets/[id]/data` dimuat lewat `next/dynamic` `ssr: false` dari komponen klien; tidak pernah diimpor
  dari rute dashboard.
* **Mitigasi stretching wajib** (aktif hanya bila rasio tinggi model / tinggi wadah > 1; kode di lampiran dan
  `docs/ai/perf/T-035/src/AgPage.jsx`):
  1. *Wheel/trackpad* (`installWheelFix`): handler `wheel` (`passive: false`) pada `.ag-grid-viewport` menambah target
     scrollTop **float** sebesar `delta / rasio`. Dipasang dari `onGridReady`; tinggi baris dan jumlah baris dari API
     (tanpa angka 32 px tetap); Ctrl (zoom), Shift, dan gerak dominan horizontal dibiarkan bawaan, komponen horizontal
     wheel diagonal diteruskan ke `scrollLeft`. Terukur 3/3/4 (Chromium, WebKit) dan 2/3/6 wheel, 2/3/5 trackpad
     (Firefox).
  2. *Baris terakhir*: **baris sentinel nyata "Akhir data"** setelah baris data terakhir, plus `onBodyScrollEnd` →
     `ensureIndexVisible(last, 'bottom')` saat scroller di dasar (`fixbottom`). Sentinel dapat difokus dan diumumkan
     sebagai "Akhir data"; Cmd/Ctrl+↓, End, dan PageDown di dasar mendarat di sentinel dengan baris data terakhir
     terlihat penuh (terukur). Akibatnya `aria-rowcount` = total baris data + 2 (header + sentinel) — **didokumentasikan,
     tidak ditambal**; label/`aria-label` sentinel menjelaskannya. Salin melewati sentinel (`rowIndex ≥ total`),
     "Ke baris" dijepit ke total, bilah status tidak menghitung sentinel. Tidak memakai `navigateToNextCell` untuk
     menghentikan keyboard di baris data terakhir.
     *Pembaruan T-048:* End/Home tanpa pengubah kini sel terakhir/pertama di baris yang sama (pola grid WAI-ARIA,
     seperti Excel), bukan baris terakhir/pertama bawaan AG; Ctrl/Cmd+↓ dan PageDown tetap mendarat di sentinel.
     `aria-rowcount` tetap total + 2 (rencana G-6 menulis total + 1; keputusan ini tidak diubah T-048).
  3. *Fokus keyboard* (`focusguard`): di `onCellFocused`, bila baris terfokus tidak terlihat penuh setelah dua frame,
     `ensureIndexVisible(row, 'top'|'bottom')`, lalu `'middle'` bila masih meleset. Tanpa ini Firefox menggulir baris
     terfokus ± 26.000 px ke luar layar (2/28 langkah) dan Chromium menyisakan setengah baris (1/28).
  4. *Ke baris N*: `ensureIndexVisible(N-1, 'middle')` + `setFocusedCell`; jangan `'top'` (meleset 3–30 px).
* **CSP**: tidak ada perubahan header T-027. Grid option `styleNonce` diisi nonce request: `proxy.ts` sudah memasang
  header permintaan `x-nonce`; halaman server `/datasets/[id]/data` membaca `(await headers()).get("x-nonce")` dan
  meneruskannya sebagai prop ke komponen klien grid → `<AgGridReact styleNonce={nonce}>`. Terbukti 0 pelanggaran bila
  `style-src 'unsafe-inline'` kelak dicabut (tanpa `styleNonce`: 16 pelanggaran `style-src-elem`).
* **Tema dan ikon**: `themeQuartz.withParams({...})` dengan nilai `hsl(var(--token))` (otomatis ikut `.dark`); ikon
  bawaan diganti SVG Tabler lewat opsi `icons`, header kolom komponen React dengan `@tabler/icons-react`.
* **Lint dan dependensi**: `eslint.config.mjs` menolak `ag-grid-enterprise`, `ag-grid-charts-enterprise`,
  `ag-charts-enterprise`, `@ag-grid-enterprise/*` (impor statis, subpath, re-export, `import()`/`require` termasuk
  template literal) di `.ts .tsx .mts .cts .js .jsx .mjs .cjs`; `tests/lib/no-enterprise-deps.test.ts` menguji aturan
  itu dan memastikan `package-lock.json` tidak memuat paket Enterprise (termasuk transitif).

### Catatan implementasi (T-043)

* **Salin** lewat event `copy` bawaan (`e.clipboardData.setData("text/plain", tsv)`; listener di `document`, cek
  `getFocusedCell()` dan fokus di dalam grid), bukan `navigator.clipboard` yang butuh secure context dan izin.
  Listener harus di `document`: tanpa seleksi teks Firefox mengirim `copy` ke body, bukan ke sel fokus (terukur).
  Community tidak punya ClipboardModule; salin baris ≤ 1.000 dibangun sendiri (rencana §3.5).
* **Ctrl+Home/End** sebagai binding sendiri (mis. `onCellKeyDown`/`suppressKeyboardEvent` → `ensureIndexVisible` +
  `setFocusedCell`): di UA macOS AG memetakan Home/End ke sel pertama/terakhir grid dan tidak bereaksi pada
  Ctrl/Cmd+Home/End; perilaku Windows belum diuji.
* **wheelfix**: pasang dari `onGridReady` (bukan timeout), lepas saat unmount, jangan ganggu gulir horizontal, baca
  tinggi baris dari API.
* **e2e gagal bila konsol memuat "AG Grid: error #200"** (modul yang kurang hanya terlihat saat runtime).
* **`styleNonce`** dialirkan dari `headers()` ke komponen klien seperti di atas.

### Status mitigasi di spike

* **Diuji bersama** (prototipe Vite, Chromium/WebKit/Firefox, `results/*-ag-mitigasi-gabungan.json`): sentinel (kosong)
  + `fixbottom` + `wheelfix` + `focusguard` + "Ke baris" `'middle'` + salin lewat event `copy` + `styleNonce` — seret ke
  akhir ✓, wheel/trackpad 3/3/4 · 3/3/4 · 2/3/5, gulir horizontal tetap jalan, Cmd+↓/End/PageDown di dasar ✓, "Ke baris
  10.000.000/9.999.999" ✓, keyboard dalam 28/28 ✓, cincin fokus tema gelap ✓. Thumb sungguhan (Chromium, scrollbar
  klasik) dengan keempat mitigasi: 6/6 baris terakhir terlihat.
* **Belum dibangun**: label "Akhir data" pada sentinel (prototipe baris kosong), pemeriksaan `aria-rowcount` = total + 2,
  bilah status yang tidak menghitung sentinel, Ctrl+Home/End kustom, rantai `styleNonce` dari `headers()` Next.
* **Belum diuji**: mitigasi di build Next 16; perangkat sentuh/trackpad nyata; pembaca layar.

### Persyaratan T-043

* e2e grid di Chromium, WebKit, dan Firefox dengan **semua mitigasi aktif bersama** pada data > 125 rb baris
  (disarankan 10 jt sintetis): seret ke akhir, wheel, Cmd/Ctrl+↓, End, dan PageDown di dasar → baris data terakhir
  terlihat penuh; "Ke baris 1 / 5.000.000 / 9.999.999 / 10.000.000" tepat.
* Keyboard dalam: dari baris 5.000.000, ArrowDown × 25 lalu PageDown, baris terfokus terlihat penuh di setiap langkah
  (wajib di Firefox); cincin fokus terlihat di tema gelap.
* Wheel dan trackpad: ≥ 10 langkah per engine, **median ≤ 5 dan maks ≤ 8 baris per 100 px**.
* Sentuh: ≤ **15 baris per usapan 300 px**; bila lewat, aktifkan mode paging blok (lihat Kriteria fallback).
* Ukuran chunk rute diukur di **build Next** (bukan Vite): ≤ 293 KiB gzip.
* e2e gagal bila konsol memuat "AG Grid: error #200".
* Gerbang a11y: axe tanpa pelanggaran serius, audit tanpa Critical/High, dan **smoke test NVDA/VoiceOver** (gerbang
  yang menentukan ADR ini `accepted`), termasuk pengumuman baris sentinel "Akhir data" dan `aria-rowcount` = total + 2.

### Syarat lisensi (dicek 2026-10-17)

* `ag-grid-community`, `ag-grid-react`, `ag-stack`, `ag-charts-types`: **MIT** (© AG GRID LTD). Boleh dipakai
  komersial tanpa kunci lisensi; pertahankan berkas lisensi di distribusi (bawaan npm).
* `ag-grid-enterprise`: lisensi komersial — US$ 999 per developer, perpetual termasuk 1 tahun update (Charts
  Enterprise US$ 499, bundel US$ 1.498). Tanpa kunci lisensi Enterprise menampilkan watermark/peringatan; karena itu
  diblokir lint dan test lockfile sampai gerbang Q6 diputuskan lewat ADR baru.
* Fitur yang kita andalkan (Infinite Row Model, stretching, ARIA, kolom beku/resize/geser, urut) ada di Community.
  Bila AG Grid memindahkan salah satunya ke Enterprise atau mengubah lisensi Community, berlaku kriteria fallback.

### Kriteria fallback

Pindah ke **TanStack Virtual 3.14.13 + paging blok 50 rb baris** (opsi 3) bila salah satu terjadi dan tidak bisa
ditutup dalam 2 hari kerja:

* salah satu persyaratan e2e T-043 di atas gagal di salah satu dari Chromium, WebKit, Firefox setelah mitigasi —
  termasuk setelah upgrade AG Grid (tetap di 36.2.0 sambil mengevaluasi). Ambang wheel/trackpad: median ≤ 5 dan
  maks ≤ 8 baris per 100 px atas ≥ 10 langkah;
* chunk rute di build Next > 293 KiB gzip dengan set modul yang dibutuhkan;
* gerbang pembaca layar NVDA/VoiceOver atau audit a11y T-043 menemukan masalah Critical/High yang tidak bisa diperbaiki
  lewat opsi AG;
* lisensi Community berubah atau fitur di atas pindah ke Enterprise.

**Langkah antara sebelum fallback penuh — mode paging blok AG untuk sentuh**: bila uji sentuh T-043 > 15 baris per
usapan 300 px (spike: 91–93 di Chromium), perangkat dengan `any-pointer: coarse` memakai AG tanpa stretching dengan
blok **50 rb baris** (batas atas `floor((4.000.000 − tinggi viewport) / tinggi baris)`, mis. ≤ 90 rb baris pada tinggi
baris 44 px, agar tetap di bawah wadah 4 jt px AG di Firefox) dan navigasi antarblok. Glide Data Grid hanya
dipertimbangkan ulang bila merilis versi stabil dengan dukungan React 19 dan perbaikan `scrollTo`.

### Consequences

* Good, because aksesibilitas DOM nyata (pembaca layar, zoom teks, cari browser, forced-colors) dan `aria-sort` tanpa
  kode tambahan; gerbang WCAG §3.7 lebih mungkin lolos (pembaca layar sendiri belum diverifikasi).
* Good, because urut multi-kolom, resize/autofit, geser, kolom beku, tooltip header, dan tema CSS variables sudah
  tersedia; Infinite Row Model cocok dengan endpoint blok `POST /api/sheets/:sheetId/rows` (blok 200, cache 50 blok).
* Good, because 0 pelanggaran CSP tanpa mengubah header T-027, dan siap untuk `style-src` ber-nonce (`styleNonce`).
* Bad, because empat mitigasi stretching adalah kode kita yang bergantung pada perilaku internal AG Grid (struktur DOM
  v36 `.ag-grid-viewport`, sinkronisasi scrollbar palsu); setiap upgrade AG wajib menjalankan ulang e2e 3 engine.
* Bad, because stretching aktif mulai 125 rb baris di Firefox (1 jt di Chromium/WebKit); seret thumb tetap kasar
  (± 16 rb baris per piksel) sehingga "Ke baris" dan Ctrl/Cmd+↓ menjadi navigasi utama; wheel Firefox tetap bergerak
  per 2–6 baris.
* Bad, because gulir sentuh tetap 10×/80× tanpa mode paging blok; ponsel/tablet bisa butuh mode tersebut.
* Bad, because ruang bundel tipis: 263,0 KiB dari 293 KiB sudah terpakai oleh modul AG sebelum UI app; salin
  baris/rentang, status bar, dan saringan daftar nilai harus dibangun sendiri (fitur Enterprise).
* Bad, because baris sentinel "Akhir data" membuat `aria-rowcount` = total + 2 dan menjadi tujuan Cmd/Ctrl+↓; perlu
  label yang jelas dan dicek di gerbang pembaca layar.

## Penegakan di repo (T-035)

* `eslint.config.mjs`: `no-restricted-imports` + `no-restricted-syntax` menolak `ag-grid-enterprise`,
  `ag-grid-charts-enterprise`, `ag-charts-enterprise`, `@ag-grid-enterprise/*` (impor statis, subpath, re-export,
  `import()`/`require` termasuk template literal) di semua ekstensi kode.
* `tests/lib/no-enterprise-deps.test.ts`: menguji aturan lint lewat API ESLint (12 bentuk impor, 8 ekstensi) dan
  memastikan `package-lock.json` tidak memuat paket Enterprise.
* Dependensi grid dipasang di T-043 dengan versi persis (`ag-grid-community@36.2.0`, `ag-grid-react@36.2.0`).

## Status implementasi (T-043, 2026-10-20)

* Dibangun: label "Akhir data" pada sentinel, `aria-rowcount` = total + 2 (diuji), bilah status yang tidak menghitung
  sentinel, Ctrl/Cmd+Home/End kustom (tangkap `keydown` di wadah grid), rantai `styleNonce` dari `headers()`, fokus DOM
  setelah "Ke baris". Catatan DOM v36: satu `.ag-row` per baris berisi sel beku (`.ag-grid-pinned-left-cells`) dan
  sel gulir; kepala ada di dalam `.ag-grid-viewport` (`role=grid`).
* Diuji di build Next (dev Turbopack) pada Chromium, Firefox, WebKit dengan semua mitigasi aktif: lulus — laporan
  `docs/ai/perf/T-043.md`; chunk rute produksi 259,9 KiB gzip.
* Belum diuji: sentuh/trackpad nyata dan **pembaca layar NVDA/VoiceOver** — ADR tetap `proposed` sampai gerbang itu
  dijalankan pemilik.

## Lampiran: kode mitigasi dari prototipe

Diringkas dari `docs/ai/perf/T-035/src/AgPage.jsx` (AG) dan `docs/ai/perf/T-035/src/GlidePage.jsx` (Glide, hanya untuk
catatan opsi pembanding). Di prototipe tiap mitigasi AG dinyalakan lewat query `?opt=…`.

```jsx
// 1. wheelfix — dipasang dari onGridReady: offWheel.current = installWheelFix(boxRef.current, e.api)
function installWheelFix(root, api) {
  const vp = root?.querySelector(".ag-grid-viewport");
  const fake = root?.querySelector(".ag-body-vertical-scroll-viewport");
  if (!vp || !fake) return null;
  let target = null;
  const onWheel = (e) => {
    if (e.ctrlKey || e.shiftKey) return; // zoom / shift+wheel horizontal: bawaan
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // dominan horizontal: bawaan
    const rowH = api.getDisplayedRowAtIndex(0)?.rowHeight;
    if (!rowH) return;
    const physMax = fake.scrollHeight - fake.clientHeight;
    const ratio = (api.getDisplayedRowCount() * rowH - fake.clientHeight) / physMax;
    if (!(ratio > 1.01)) return; // tanpa stretching
    e.preventDefault();
    const unit = e.deltaMode === 1 ? rowH : e.deltaMode === 2 ? fake.clientHeight : 1;
    if (e.deltaX) vp.scrollLeft += e.deltaX * unit;
    if (target === null || Math.abs(target - vp.scrollTop) > 2) target = vp.scrollTop; // diseret di luar handler
    target = Math.max(0, Math.min(physMax, target + (e.deltaY * unit) / ratio));
    vp.scrollTop = target;
  };
  vp.addEventListener("wheel", onWheel, { passive: false });
  return () => vp.removeEventListener("wheel", onWheel);
}

// 2. fixbottom — TOTAL = baris data + 1 sentinel
const onBodyScrollEnd = (e) => {
  if (e.direction !== "vertical") return;
  const el = document.querySelector(".ag-body-vertical-scroll-viewport");
  if (el && el.scrollTop >= el.scrollHeight - el.clientHeight - 2) api.ensureIndexVisible(TOTAL - 1, "bottom");
};

// 3. focusguard — onCellFocused
const onCellFocused = (e) => {
  if (e.rowIndex == null) return;
  const check = (attempt) => {
    const vp = box.querySelector(".ag-grid-viewport");
    const top = box.querySelector(".ag-header").getBoundingClientRect().bottom;
    const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
    const r = vp.querySelector(`.ag-row[row-index="${e.rowIndex}"]`)?.getBoundingClientRect();
    if (r && r.top >= top - 1 && r.bottom <= bottom + 1) return;
    api.ensureIndexVisible(e.rowIndex, attempt > 0 ? "middle" : !r || r.top < top ? "top" : "bottom");
    if (attempt < 1) requestAnimationFrame(() => requestAnimationFrame(() => check(attempt + 1)));
  };
  requestAnimationFrame(() => requestAnimationFrame(() => check(0)));
};

// 4. Ke baris N
const goTo = (n) => {
  api.ensureIndexVisible(n - 1, "middle");
  api.setFocusedCell(n - 1, "c0");
};

// Salin sel lewat event copy bawaan (listener di document); diringkas — kolom → indeks di prototipe
const onCopy = (e) => {
  const fc = api.getFocusedCell();
  if (!fc || fc.rowIndex == null || fc.rowIndex >= ROWS || !box.contains(document.activeElement)) return;
  if (window.getSelection()?.toString()) return; // teks terpilih: salin bawaan
  e.clipboardData.setData("text/plain", toTsv([[cellCopy(fc.rowIndex, fc.column.getColId())]]));
  e.preventDefault();
};

// Glide (pembanding, tidak dipakai): scrollTo bawaan tidak sadar stretching
async function scrollToRowStretched(sc, row) {
  const ch = sc.clientHeight;
  const vMax = TOTAL * RH + HEADER - ch;
  const pMax = sc.scrollHeight - ch;
  const vy = Math.max(0, Math.min(vMax, row * RH - (ch - HEADER - RH) / 2));
  const r = window.__glideRegion;
  const curV = r ? r.y * RH - (r.ty ?? 0) : 0;
  if (Math.abs(vy - curV) <= 2000) return void (sc.scrollTop += Math.round(vy - curV)); // jalur 1:1
  const pPerc = Math.round((vy / vMax) * pMax);
  const edge = pPerc > pMax / 2 ? 0 : pMax; // tepi dipetakan tepat oleh Glide
  sc.scrollTop = edge;
  await frame();
  sc.scrollTop = Math.abs(pPerc - edge) > 2000 ? pPerc : edge + Math.round(vy - (edge === 0 ? 0 : vMax));
  await frame();
}
```
