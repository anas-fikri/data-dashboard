/*
 * Regenerasi semua fixture kecil yang di-commit di tests/fixtures/ (deterministik, seed tetap).
 *   npm run fixtures
 * Daftar ini adalah sumber kebenaran isi tests/fixtures/README.md.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

export const COMMITTED: { out: string; args: string[]; purpose: string }[] = [
  {
    out: "tests/fixtures/kecil.xlsx",
    args: [
      "--kind",
      "xlsx",
      "--sheets",
      "2",
      "--rows",
      "2000",
      "--cols",
      "12",
      "--header-row",
      "4",
      "--dup-headers",
      "--mixed-dates",
      "--number-locale",
      "id",
    ],
    purpose:
      "2 sheet; judul + baris kosong di atas header (baris 4); header duplikat + kosong; tanggal campuran; angka teks ID",
  },
  {
    out: "tests/fixtures/tiga-sheet.xlsx",
    args: [
      "--kind",
      "xlsx",
      "--sheets",
      "3",
      "--rows",
      "300",
      "--cols",
      "12",
      "--header-row",
      "4",
      "--dup-headers",
      "--mixed-dates",
      "--seed",
      "7",
    ],
    purpose:
      "3 sheet; header di baris 4 (judul + baris kosong di atasnya); header duplikat + kosong — AC T-006",
  },
  {
    out: "tests/fixtures/sedang.xlsx",
    args: [
      "--kind",
      "xlsx",
      "--sheets",
      "1",
      "--rows",
      "20000",
      "--cols",
      "20",
      "--text-ratio",
      "0.6",
      "--unique-ratio",
      "0.7",
      "--header-row",
      "3",
      "--mixed-dates",
    ],
    purpose:
      "teks-berat 20k baris; jalur spill sharedStrings (SAX_SPILL_MB=0) dan uji inferensi tipe",
  },
  {
    out: "tests/fixtures/kecil-us.csv",
    args: [
      "--kind",
      "csv",
      "--rows",
      "2000",
      "--cols",
      "12",
      "--number-locale",
      "us",
      "--delimiter",
      ",",
    ],
    purpose:
      "UTF-8, koma, desimal US, tanggal dd/mm/yyyy, quoting RFC 4180 (koma/kutip/baris baru di sel)",
  },
  {
    out: "tests/fixtures/kecil-id-titikkoma.csv",
    args: [
      "--kind",
      "csv",
      "--rows",
      "2000",
      "--cols",
      "12",
      "--number-locale",
      "id",
      "--delimiter",
      ";",
      "--encoding",
      "utf8bom",
      "--header-row",
      "3",
    ],
    purpose: "UTF-8 dengan BOM, titik koma, desimal ID, 2 baris pembuka",
  },
  {
    out: "tests/fixtures/kecil-win1252.csv",
    args: [
      "--kind",
      "csv",
      "--rows",
      "500",
      "--cols",
      "10",
      "--delimiter",
      ";",
      "--encoding",
      "win1252",
    ],
    purpose: "Windows-1252 (café, señal, über) — deteksi encoding",
  },
  {
    out: "tests/fixtures/utf16.csv",
    args: ["--kind", "csv", "--rows", "50", "--cols", "6", "--encoding", "utf16le"],
    purpose: "UTF-16 LE + BOM — harus DITOLAK dengan pesan simpan ulang sebagai UTF-8",
  },
];

function main() {
  mkdirSync("tests/fixtures/hostile", { recursive: true });
  for (const f of COMMITTED) {
    const r = spawnSync("npx", ["tsx", "scripts/make-fixture.ts", ...f.args, "--out", f.out], {
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const h = spawnSync(
    "npx",
    ["tsx", "scripts/fixtures/make-hostile.ts", "tests/fixtures/hostile"],
    {
      stdio: "inherit",
    },
  );
  process.exit(h.status ?? 1);
}

if (process.argv[1]?.endsWith("build-committed.ts")) main();
