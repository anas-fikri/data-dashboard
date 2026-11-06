import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideMarkdown, guideUrl } from "@/features/guides/markdown";
import { guideBodyProblem, guideInputSchema } from "@/features/guides/validation";

/* T-020 AC2/AC6: markdown panduan disanitasi — tag/URL berbahaya hilang, tautan luar rel aman. */
/**
 * Batas waktu render uji DoS: regresi yang dicari 1,4–5 s (kuadratik); render normal ≈ 60 ms. Diukur
 * sebagai waktu CPU proses (pool forks = satu proses per file), bukan waktu dinding yang membengkak
 * > 1 s saat mesin sibuk (load ±30) sehingga uji ini sempat flaky. Waktu CPU pun bisa ±1,1 s di VM yang
 * sibuk (JIT/GC; T-tpfh, keputusan pemilik 2026-10-23): batas 1,3 s — tetap di bawah regresi terkecil 1,4 s.
 */
const RENDER_MAX_MS = 1_300;
const cpuMs = (fn: () => void) => {
  const t = process.cpuUsage();
  fn();
  const d = process.cpuUsage(t);
  return (d.user + d.system) / 1000;
};
const ORIGINS = ["https://dashboard.pcpexpress.com", "https://storage.pcpexpress.com"];
const html = (md: string) =>
  renderToStaticMarkup(createElement(GuideMarkdown, { markdown: md, origins: ORIGINS }));

describe("GuideMarkdown (T-020)", () => {
  it("AC2: <script> dihapus dan tidak dieksekusi (HTML mentah tidak dirender)", () => {
    const out = html("Halo <script>alert(1)</script> **tebal**\n\n<script src=x></script>");
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("<strong>tebal</strong>");
  });

  it("AC6: javascript:, data:, iframe, object, form, style, img luar dihapus", () => {
    const out = html(
      [
        "[klik](javascript:alert(1)) [data](data:text/html,<b>x</b>) [JS](JaVaScRiPt:alert(1))",
        '<iframe src="https://evil.example"></iframe>',
        '<object data="x"></object><form action="/x"><input></form><style>body{}</style>',
        "![luar](https://evil.example/a.png) ![proto](//evil.example/b.png)",
      ].join("\n\n"),
    );
    expect(out).not.toMatch(/javascript:|data:text|<iframe|<object|<form|<style|<input/i);
    // HTML mentah tampil sebagai teks (di-escape); yang dilarang: atribut yang memuat origin jahat.
    expect(out).not.toMatch(/(?:src|href)="[^"]*evil\.example/);
  });

  it("tautan eksternal rel noopener noreferrer; tautan internal/mailto tanpa rel; gambar self/storage tetap", () => {
    const out = html(
      "[luar](https://example.org/x) [dalam](/dashboards) [app](https://dashboard.pcpexpress.com/panduan) [surel](mailto:a@pcpexpress.com)\n\n![a](/panduan/a.png) ![b](https://storage.pcpexpress.com/guides/b.png)",
    );
    expect(out).toMatch(/href="https:\/\/example\.org\/x"[^>]*rel="noopener noreferrer"/);
    expect(out).toContain('href="/dashboards"');
    expect(out).not.toMatch(/href="\/dashboards"[^>]*rel=/);
    expect(out).not.toMatch(/dashboard\.pcpexpress\.com\/panduan"[^>]*rel=/);
    expect(out).toContain('href="mailto:a@pcpexpress.com"');
    expect(out).toContain('src="/panduan/a.png"');
    expect(out).toContain('src="https://storage.pcpexpress.com/guides/b.png"');
  });

  it("guideUrl: aturan href/src", () => {
    expect(guideUrl("javascript:alert(1)", "href", ORIGINS)).toBe("");
    expect(guideUrl(" data:text/html,x", "href", ORIGINS)).toBe("");
    expect(guideUrl("#bagian", "href", ORIGINS)).toBe("#bagian");
    expect(guideUrl("relatif/a", "src", ORIGINS)).toBe("");
    expect(guideUrl("https://storage.pcpexpress.com.evil.example/x.png", "src", ORIGINS)).toBe("");
  });
  it("review AC5: judul isi di bawah judul artikel (h2) — # → h3, lompatan #### → h5; blok kode bisa difokus", () => {
    const out = html("# Satu\n\n## Dua\n\n#### Empat\n\n```\nkode panjang\n```");
    expect(out).not.toMatch(/<h[12][\s>]/);
    expect(out).toMatch(/<h3[^>]*>Satu<\/h3>/);
    expect(out).toMatch(/<h4[^>]*>Dua<\/h4>/);
    expect(out).toMatch(/<h5[^>]*>Empat<\/h5>/);
    expect(out).toMatch(/<pre[^>]*tabindex="0"/);
  });
  it("review R3: http:host tanpa // (tautan + autolink) tetap dianggap eksternal → rel", () => {
    const out = html("[a](http:evil.example) [b](https:/evil.example/x) <http:evil.example>");
    expect(out.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
  });

  it("review R2: struktur bertingkat/penekanan berlebih ditolak saat simpan dan tidak dirender", () => {
    const bombs = [
      ">".repeat(2000),
      "> - ".repeat(500),
      "*a".repeat(5000),
      "*_".repeat(3000),
      "a\r" + ">".repeat(19_998), // R2-2: \r tunggal = pemisah baris bagi pengurai
      "> a\n" + "=\n".repeat(9998), // R3-1: kutipan + ribuan baris lanjutan malas
      "- a\n" + "=\nb\n".repeat(4999),
    ];
    for (const md of bombs) {
      expect(guideBodyProblem(md), md.slice(0, 8)).not.toBeNull();
      expect(
        cpuMs(() => expect(html(md)).toContain("Isi artikel tidak dapat ditampilkan")),
      ).toBeLessThan(RENDER_MAX_MS);
      const r = guideInputSchema.safeParse({
        title: "A",
        slug: "a",
        role: "ALL",
        contextKey: null,
        bodyMarkdown: md,
      });
      expect(r.success).toBe(false);
    }
    const prose =
      "## Langkah\n\nUnggah **file Excel** lalu periksa [skema](/datasets) dan `kolom_a`.\n\n- satu\n  - dua\n    1. tiga\n\n> catatan *penting*\n\n";
    const real = prose.repeat(Math.floor(20_000 / prose.length));
    expect(guideBodyProblem(real)).toBeNull();
    expect(html(real)).toContain("<strong>file Excel</strong>");
    // Tepat di bawah batas baris: pola terburuk R3-1 tetap cepat.
    const edge = "> a\n" + "=\nb\n".repeat(999);
    expect(guideBodyProblem(edge)).toBeNull();
    expect(cpuMs(() => html(edge))).toBeLessThan(RENDER_MAX_MS);
  });
  it("review R2-1: HTML mentah tidak diurai — pembuka tanpa penutup tidak kuadratik, tampil sebagai teks", () => {
    for (const md of ["a " + "<?".repeat(9999), "<!A".repeat(6666), "<!--".repeat(5000)]) {
      expect(guideBodyProblem(md)).toBeNull();
      expect(
        cpuMs(() => html(md)),
        md.slice(0, 6),
      ).toBeLessThan(RENDER_MAX_MS);
    }
    expect(html("x <b>tebal</b>")).toContain("&lt;b&gt;tebal&lt;/b&gt;");
  });
  it("review T-022 D2: tingkat judul relatif terhadap judul teratas isi — tidak melompat", () => {
    const md = "## Dua\n\n### Tiga\n\n##### Lima";
    const at = (offset: 1 | 2 | 3) =>
      [
        ...renderToStaticMarkup(
          createElement(GuideMarkdown, { markdown: md, origins: ORIGINS, headingOffset: offset }),
        ).matchAll(/<h(\d)/g),
      ].map((m) => Number(m[1]));
    expect(at(1)).toEqual([2, 3, 4]);
    expect(at(2)).toEqual([3, 4, 5]);
    expect(at(3)).toEqual([4, 5, 6]);
  });
  it("T-exfc NB2: lompatan di dalam isi dirapatkan; judul setara tetap setara, sarang tetap", () => {
    const levels = (md: string, headingOffset: 1 | 2 | 3 = 1) =>
      [
        ...renderToStaticMarkup(
          createElement(GuideMarkdown, { markdown: md, origins: ORIGINS, headingOffset }),
        ).matchAll(/<h(\d)/g),
      ].map((m) => Number(m[1]));
    // ## → #### → ### → ## → ######: tiap judul paling banyak satu tingkat di bawah judul sebelumnya.
    expect(levels("## A\n\n#### B\n\n### C\n\n## D\n\n###### E")).toEqual([2, 3, 3, 2, 3]);
    // Isi dimulai lebih dalam dari judul berikutnya: keduanya tingkat teratas isi.
    expect(levels("### A\n\n## B\n\n#### C")).toEqual([2, 2, 3]);
    // Batas h6 di panel bantuan (offset 3): tingkat dalam berhenti di h6.
    expect(levels("# A\n\n## B\n\n### C\n\n#### D", 3)).toEqual([4, 5, 6, 6]);
  });
});

/* T-0vjt AC1: tabel GFM dirender sebagai tabel dalam wilayah gulir yang bisa difokus; GFM lain tidak. */
describe("GuideMarkdown tabel (T-0vjt)", () => {
  const TABLE = [
    "| Peran | Hak **akses** | Jumlah |",
    "| :-- | :-: | --: |",
    "| Pemilik | Semua | 3 |",
    "| Viewer | Lihat saja |",
  ].join("\n");

  it("tabel GFM → table/thead/tbody/th/td di wilayah gulir bernama, bukan teks mentah", () => {
    const out = html(`Ringkasan:\n\n${TABLE}`);
    expect(out).not.toContain("| :--");
    expect(out).toMatch(
      /<div role="region" aria-label="Tabel: Peran, Hak akses, Jumlah" tabindex="0"[^>]*><table/,
    );
    expect(out).toMatch(/<thead>.*<\/thead><tbody>.*<\/tbody><\/table><\/div>/);
    expect(out.match(/<th scope="col"/g)).toHaveLength(3);
    expect(out).toContain("<strong>akses</strong>");
    // Perataan kolom → text-align per sel (atribut align usang tidak dipakai); baris pendek diisi sel.
    expect(out).toContain('<th scope="col" style="text-align:left">Peran</th>');
    expect(out).toContain('<td style="text-align:center">Semua</td>');
    expect(out).toContain('<td style="text-align:right">3</td>');
    expect(out).not.toMatch(/\salign=/);
    expect(out.match(/<td[\s>]/g)).toHaveLength(6);
    // Tanpa perataan: sel polos (gaya sel ada sekali di <table>, bukan per sel).
    expect(html("| A |\n|---|\n| 1 |")).toMatch(/<th scope="col">A<\/th>.*<td>1<\/td>/);
  });

  it("dua tabel → nama wilayah berbeda; judul kolom kosong → 'Tabel'", () => {
    const out = html(`${TABLE}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n| |\n|-|\n| x |`);
    const labels = [...out.matchAll(/role="region" aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Tabel: Peran, Hak akses, Jumlah", "Tabel: A, B", "Tabel"]);
  });

  it("T-fesf: tabel berjudul sama dan beberapa blok kode → nama wilayah unik berurutan", () => {
    const t = "| A | B |\n|---|---|\n| 1 | 2 |";
    const out = html(`${t}\n\n\`\`\`\nx\n\`\`\`\n\n${t}\n\n\`\`\`\ny\n\`\`\`\n\n${t}`);
    const labels = [...out.matchAll(/role="region" aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "Tabel: A, B",
      "Blok kode",
      "Tabel: A, B (2)",
      "Blok kode (2)",
      "Tabel: A, B (3)",
    ]);
    // Judul kolom asli "A (2)" tidak bentrok dengan urutan buatan.
    const one = (h: string) => `| ${h} |\n|---|\n| 1 |`;
    const clash = html(`${one("A")}\n\n${one("A")}\n\n${one("A (2)")}`);
    expect([...clash.matchAll(/role="region" aria-label="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "Tabel: A",
      "Tabel: A (2)",
      "Tabel: A (2) (2)",
    ]);
  });

  it("hanya elemen tabel yang baru: coret, daftar tugas, catatan kaki, tautan teks biasa tetap teks", () => {
    const out = html(
      [
        TABLE,
        "~~coret~~ ~satu~ www.example.org https://example.org/x surat@pcpexpress.com",
        "- [ ] tugas\n- [x] selesai",
        "Catatan[^1].\n\n[^1]: Isi catatan.",
        "<table><tr><td>mentah</td></tr></table>",
      ].join("\n\n"),
    );
    const tags = new Set([...out.matchAll(/<([a-z][a-z0-9]*)/g)].map((m) => m[1]));
    expect([...tags].sort()).toEqual(
      ["div", "li", "p", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul"].sort(),
    );
    expect(out).toContain("~~coret~~");
    expect(out).toContain("[ ] tugas");
    expect(out).toContain("&lt;table&gt;");
  });

  it("tabel di dalam kutipan dan daftar ikut dirender", () => {
    const out = html(`> ${TABLE.split("\n").join("\n> ")}\n\n- ${TABLE.split("\n").join("\n  ")}`);
    expect(out.match(/<table/g)).toHaveLength(2);
  });

  it("kolom > 8 ditolak saat simpan dan tidak dirender; tabel terburuk dalam batas tetap cepat", () => {
    const row = (n: number, cell: string) => `|${Array(n).fill(cell).join("|")}|`;
    const wide = `${row(9, "a")}\n${row(9, "---")}\n${row(9, "1")}`;
    expect(guideBodyProblem(wide)).toMatch(/Tabel terlalu lebar/);
    expect(guideBodyProblem(`> - ${row(9, ":-:")}`)).toMatch(/Tabel terlalu lebar/);
    // T-fesf: contoh di blok kode berpagar tingkat atas = teks literal, tidak ditolak.
    expect(guideBodyProblem(`\`\`\`text\n${row(9, "---")}\n\`\`\``)).toBeNull();
    expect(guideBodyProblem(`~~~~\n${row(9, "---")}\n~~~\n~~~~`)).toBeNull();
    // Sesudah pagar ditutup, tabel sungguhan tetap ditolak.
    expect(guideBodyProblem(`\`\`\`\nkode\n\`\`\`\n${wide}`)).toMatch(/Tabel terlalu lebar/);
    // Bukan pagar menurut CommonMark (info string backtick berisi backtick / menjorok dalam daftar yang
    // ditutup implisit oleh pengurai) → isi tetap diperiksa, batas tidak bisa diakali.
    expect(guideBodyProblem(`\`\`\` \`x\n${wide}`)).toMatch(/Tabel terlalu lebar/);
    expect(guideBodyProblem(`- a\n  \`\`\`\nb\n${wide}`)).toMatch(/Tabel terlalu lebar/);
    // Review T-fesf: pembuka menjorok 1–3 spasi atau sesudah BOM membuat pelacak terbalik (penutup kolom 0
    // terbaca pembuka) → gagal tertutup, tabel sesudahnya tetap ditolak.
    for (const opener of [" ```", "   ```", "\uFEFF```", "- ```", "> ~~~"])
      expect(guideBodyProblem(`${opener}\nx\n\`\`\`\n\n${wide}`), opener).toMatch(
        /Tabel terlalu lebar/,
      );
    // Kedalaman kutipan tetap diperiksa di dalam blok kode (bukan celah urai lambat).
    expect(guideBodyProblem(`\`\`\`\n${"> ".repeat(13)}x\n\`\`\``)).toMatch(/bersarang/);
    expect(html(wide)).toContain("Isi artikel tidak dapat ditampilkan");
    // 3.000 kolom × 2.000 baris = 6 juta sel tanpa batas; dengan batas: 8 × 1.990 ≈ 16 ribu sel.
    const bomb = `${row(3000, "a")}\n${row(3000, "-")}\n${"a\n".repeat(1990)}`;
    expect(guideBodyProblem(bomb)).not.toBeNull();
    const edge = `${row(8, "a")}\n${row(8, "-")}\n${"a\n".repeat(1990)}`;
    expect(guideBodyProblem(edge)).toBeNull();
    expect(cpuMs(() => expect(html(edge).match(/<td>/g)).toHaveLength(8 * 1990))).toBeLessThan(
      RENDER_MAX_MS,
    );
    // Garis bukan pemisah tabel tidak terkena batas (pemisah tematik, teks dengan tanda hubung).
    expect(guideBodyProblem(`${"- ".repeat(5)}\n\n${"a - b | ".repeat(20)}`)).toBeNull();
  });
});
