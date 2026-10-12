# Fixture data uji

Semua fixture disintesis oleh `scripts/make-fixture.ts` dari model sel deterministik
(`scripts/fixtures/model.ts`, seed default 42). Jangan mengedit file ini dengan tangan; ubah
`scripts/fixtures/build-committed.ts` lalu jalankan:

```bash
npm run fixtures
```

Setiap file punya `<nama>.manifest.json`: parameter, jumlah baris fisik/terisi, jumlah sel
teks/angka/tanggal, dan checksum isi teks (XOR fnv1a dari `baris:kolom:teks`). Test dan benchmark
memakai manifest ini sebagai kebenaran, sehingga parser bisa diverifikasi per sel.

## Fixture yang di-commit (± 6 MB)

| File                     | Isi                                                                                                                                                                                                                                                                                                | Dipakai untuk                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `kecil.xlsx`             | 2 sheet × 2.000 baris × 12 kolom. Judul di baris 1, baris 2 kosong, keterangan di baris 3, header di baris 4. Header duplikat dan satu header kosong. Tanggal campuran (sel tanggal asli, `dd/mm/yyyy`, `yyyy-mm-dd`). Angka teks format ID. `sharedStrings.xml` setelah worksheet (urutan Excel). | Parser + raw.parquet (T-006), pilih ulang header, inferensi tipe dan locale (T-007), unit test parser |
| `sedang.xlsx`            | 1 sheet × 20.000 baris × 20 kolom, teks-berat (60% kolom teks, 70% unik), header baris 3                                                                                                                                                                                                           | Jalur spill sharedStrings (`SAX_SPILL_MB=0`), inferensi tipe pada volume sedang                       |
| `kecil-us.csv`           | UTF-8, koma, desimal US, tanggal `dd/mm/yyyy`, sel berisi koma/kutip/baris baru (RFC 4180)                                                                                                                                                                                                         | Sniff delimiter/quote, locale US (T-006/T-007)                                                        |
| `kecil-id-titikkoma.csv` | UTF-8 + BOM, titik koma, desimal ID, 2 baris pembuka sebelum header                                                                                                                                                                                                                                | Sniff BOM + delimiter, header bukan baris 1                                                           |
| `kecil-win1252.csv`      | Windows-1252 (café, señal, über), titik koma                                                                                                                                                                                                                                                       | Deteksi encoding non-UTF-8                                                                            |
| `utf16.csv`              | UTF-16 LE + BOM                                                                                                                                                                                                                                                                                    | Harus DITOLAK (pesan: simpan ulang sebagai CSV UTF-8), sudah di pra-cek unggah T-004                  |
| `hostile/doctype.xlsx`   | Worksheet dengan DOCTYPE + entitas bersarang (10^10 bila diekspansi)                                                                                                                                                                                                                               | Parser wajib menolak DOCTYPE                                                                          |
| `hostile/zipbomb.xlsx`   | Worksheet 128 MB berulang, terkompresi ± 1 MB (± 117x)                                                                                                                                                                                                                                             | Batas rasio dekompresi dan total ukuran tak terkompresi                                               |

## Fixture performa (tidak di-commit)

Disintesis ke `tests/fixtures/perf/` (gitignored) untuk `docs/ai/perf/T-005.md` dan T-024. Butuh ± 2 GB disk.

```bash
# xlsx 1 GB teks-berat (D10): 3 sheet × 1 juta baris × 30 kolom, ± 3 menit
npx tsx scripts/make-fixture.ts --kind xlsx --out tests/fixtures/perf/teks-berat-1gb.xlsx \
  --sheets 3 --rows 1000000 --cols 30 --text-ratio 0.6 --unique-ratio 0.7 \
  --header-row 3 --mixed-dates --dup-headers
# csv 1 GB ± 8 juta baris, ± 20 detik
npx tsx scripts/make-fixture.ts --kind csv --out tests/fixtures/perf/8jt-baris-1gb.csv \
  --rows 8100000 --cols 10 --text-ratio 0.3 --unique-ratio 0.2 --number-locale id --delimiter ";"
# benchmark satu parser per proses (exceljs | duckdb | sax | duckdb-csv), --verify untuk cek per sel
npx tsx scripts/bench-parsers.ts --file tests/fixtures/perf/teks-berat-1gb.xlsx --parser sax
npx tsx scripts/bench-hostile.ts tests/fixtures/hostile
```

`npm run check` tidak membaca `tests/fixtures/perf/` (vitest mengecualikan `tests/fixtures/**`).
