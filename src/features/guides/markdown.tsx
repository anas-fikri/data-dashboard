import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import Markdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import { GUIDE_BODY_MAX, TABLE_COLS_MAX, guideBodyProblem } from "./validation";

/*
 * Render markdown artikel panduan (T-020), dipakai halaman /panduan dan pratinjau editor admin. Tiga
 * lapis: (1) HTML mentah di markdown TIDAK dirender (tanpa rehype-raw) — <script>, <iframe>, <object>,
 * <form>, <style> tidak pernah menjadi elemen; (2) rehype-sanitize skema allowlist (GitHub) dengan
 * protokol href hanya http/https/mailto; (3) guideUrl: href javascript:/data:/lainnya dibuang, gambar
 * hanya dari path relatif aplikasi atau origin yang diizinkan (app + storage). Tautan ke origin lain
 * mendapat rel="noopener noreferrer". Dari GFM hanya tabel yang aktif (T-0vjt, remarkTable).
 */

const SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
};

/**
 * Plugin remark: matikan penguraian HTML mentah (htmlFlow/htmlText) di micromark. HTML memang tidak
 * pernah dirender, tetapi pembuka tanpa penutup (`<?`, `<!--`, `<![CDATA[`) membuat penguraian
 * kuadratik (20 ribu karakter ≈ 5 s, review R2-1); kini tampil sebagai teks biasa.
 */
function remarkNoHtml(this: { data(): object }) {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push({ disable: { null: ["htmlFlow", "htmlText"] } });
}

/**
 * Plugin remark: tabel GFM saja (T-0vjt). Bukan remark-gfm penuh — itu juga membawa coret, daftar tugas
 * (<input>), catatan kaki, dan tautan otomatis dari teks biasa; elemen baru di keluaran hanya
 * table/thead/tbody/tr/th/td (sudah ada di skema sanitasi). Batas kolom: guideBodyProblem saat simpan,
 * dan di sini sebagai pertahanan berlapis (review T-fesf): tabel > TABLE_COLS_MAX kolom diganti teks
 * sebelum toHast — penambalan sel ke lebar penuh baru terjadi di toHast, jadi keluaran tetap terbatas
 * walau pemeriksaan per baris terkecoh.
 */
function remarkTable(this: { data(): object }) {
  const data = this.data() as {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
  };
  (data.micromarkExtensions ??= []).push(gfmTable());
  (data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
  const cap = (n: MdNode) => {
    if (!n.children) return;
    n.children = n.children.map((c) => {
      if (c.type !== "table" || (c.align?.length ?? 0) <= TABLE_COLS_MAX) {
        cap(c);
        return c;
      }
      const value = `Tabel terlalu lebar untuk ditampilkan (maks. ${TABLE_COLS_MAX} kolom).`;
      return { type: "paragraph", children: [{ type: "text", value }] };
    });
  };
  return cap;
}

interface MdNode {
  type: string;
  depth?: number;
  align?: unknown[];
  value?: string;
  children?: MdNode[];
}

/**
 * Plugin remark: tingkat judul di isi dirapatkan lalu + offset — tidak ada lompatan tingkat, baik di
 * bawah judul artikel (isi dimulai "##" → h2, bukan h3; review T-022 D2) maupun di dalam isi ("##" lalu
 * "####" → h2 lalu h3; NB2). Tiap judul = induknya (judul sebelumnya yang lebih dangkal) + 1, jadi
 * struktur bersarang tetap dan judul yang setara tetap setara. Batas h6.
 */
function remarkShiftHeadings(offset: number) {
  return (tree: MdNode) => {
    const heads: MdNode[] = [];
    const walk = (n: MdNode) => {
      if (n.type === "heading") heads.push(n);
      n.children?.forEach(walk);
    };
    walk(tree);
    // Tumpukan induk: [kedalaman markdown asli, tingkat hasil (1 = paling atas di isi)].
    const parents: [number, number][] = [];
    for (const h of heads) {
      const depth = h.depth ?? 1;
      while (parents.length && parents.at(-1)![0] >= depth) parents.pop();
      const level = (parents.at(-1)?.[1] ?? 0) + 1;
      parents.push([depth, level]);
      h.depth = Math.min(6, level + offset);
    }
  };
}

const relative = (url: string) => !url.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(url);

/** URL aman untuk atribut `key` (href/src), "" bila ditolak. `origins`: origin yang boleh untuk gambar. */
export function guideUrl(url: string, key: string, origins: readonly string[]): string {
  const u = url.trim();
  if (key === "src") {
    if (relative(u)) return u.startsWith("/") ? u : "";
    try {
      const parsed = new URL(u);
      return /^https?:$/.test(parsed.protocol) && origins.includes(parsed.origin) ? u : "";
    } catch {
      return "";
    }
  }
  if (relative(u)) return u;
  return /^(https?|mailto):/i.test(u) ? u : "";
}

function externalHref(href: string | undefined, origins: readonly string[]): boolean {
  // "http:evil.example" (tanpa //) juga diurai peramban menjadi http://evil.example/.
  if (!href || !/^https?:/i.test(href)) return false;
  try {
    return !origins.includes(new URL(href).origin);
  } catch {
    return true;
  }
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}
const textOf = (n: HastNode): string =>
  n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(textOf).join("");

/** Nama wilayah gulir tabel dari judul kolomnya, agar beberapa tabel di satu artikel terbedakan. */
function tableLabel(table: HastNode | undefined): string {
  const head = table?.children?.find((c) => c.tagName === "thead");
  const cols = (head?.children?.find((c) => c.tagName === "tr")?.children ?? [])
    .filter((c) => c.tagName === "th")
    .map((c) => textOf(c).trim())
    .filter(Boolean);
  const label = cols.length ? `Tabel: ${cols.join(", ")}` : "Tabel";
  return label.length > 80 ? `${label.slice(0, 79)}…` : label;
}

/**
 * Nama wilayah gulir (tabel, blok kode) unik per artikel (review T-0vjt, axe landmark-unique): nama
 * yang berulang diberi urutan "(2)", "(3)". Dihitung sekali per dokumen (plugin rehype sesudah sanitasi),
 * bukan saat render komponen yang bisa dipanggil dua kali.
 */
function rehypeRegionNames() {
  return (tree: HastNode) => {
    const used = new Set<string>();
    const next = new Map<string, number>(); // urutan berikutnya per nama dasar: tetap linear
    const visit = (n: HastNode) => {
      if (n.tagName === "table" || n.tagName === "pre") {
        const base = n.tagName === "table" ? tableLabel(n) : "Blok kode";
        let name = base;
        let k = next.get(base) ?? 2;
        // Naik terus sampai belum dipakai: judul kolom asli "A (2)" tidak bentrok dengan urutan buatan.
        while (used.has(name)) name = `${base} (${k++})`;
        next.set(base, k);
        used.add(name);
        n.properties = { ...n.properties, dataRegion: name };
      }
      n.children?.forEach(visit);
    };
    visit(tree);
  };
}
const regionName = (node: unknown, fallback: string) =>
  String((node as HastNode | undefined)?.properties?.dataRegion ?? fallback);

const HEADING = [
  "mt-6 text-base font-semibold first:mt-0",
  "mt-5 text-sm font-semibold first:mt-0",
  "mt-4 text-sm font-semibold first:mt-0",
  "mt-4 text-sm font-medium first:mt-0",
];

export function GuideMarkdown({
  markdown,
  origins,
  headingOffset = 2,
}: {
  markdown: string;
  /** Origin app + storage publik (gambar boleh dari sini; tautan ke sini bukan "eksternal"). */
  origins: readonly string[];
  /**
   * Tingkat tambahan judul isi: 2 = "#" → h3 (judul artikel h2 di daftar/pratinjau), 1 = "#" → h2
   * (halaman artikel, judul h1), 3 = "#" → h4 (panel bantuan, judul artikel h3). Ukuran tetap lebih
   * kecil dari judul artikel.
   */
  headingOffset?: 1 | 2 | 3;
}) {
  // Tingkat tag sudah digeser remarkShiftHeadings; ukuran mengikuti tingkat relatif di isi.
  const heading =
    (level: number) =>
    // eslint-disable-next-line react/display-name -- pemetaan komponen react-markdown
    ({ children }: { children?: React.ReactNode }) => {
      const Tag = `h${level}` as "h2";
      const rel = Math.max(1, level - headingOffset);
      return <Tag className={HEADING[Math.min(rel, 4) - 1]}>{children}</Tag>;
    };
  // Data yang lolos sebelum batas struktur berlaku tidak boleh menjatuhkan atau membekukan halaman.
  const problem =
    markdown.length > GUIDE_BODY_MAX ? "isi melebihi batas panjang" : guideBodyProblem(markdown);
  if (problem) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="guide-markdown">
        Isi artikel tidak dapat ditampilkan: {problem}
      </p>
    );
  }
  const components: Components = {
    a: ({ href, children }) => (
      <a
        href={href}
        className="font-medium text-primary underline underline-offset-2"
        {...(externalHref(href, origins) ? { rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    ),
    img: ({ src, alt }) =>
      typeof src === "string" && src ? (
        <img src={src} alt={alt ?? ""} loading="lazy" className="max-w-full rounded-md border" />
      ) : null,
    // Judul di isi di bawah judul artikel (headingOffset) dan lebih kecil darinya.
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    p: ({ children }) => <p className="mt-3 leading-relaxed first:mt-0">{children}</p>,
    ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="mt-3 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
    ),
    code: ({ children }) => (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.875em]">{children}</code>
    ),
    pre: ({ node, children }) => (
      // tabIndex: blok kode yang meluap bisa digulir dengan keyboard (axe scrollable-region-focusable).
      <pre
        role="region"
        aria-label={regionName(node, "Blok kode")}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {children}
      </pre>
    ),
    // Tabel lebar digulir di wilayahnya sendiri (bisa difokus keyboard), bukan melebarkan halaman.
    table: ({ node, children }) => (
      <div
        role="region"
        aria-label={regionName(node, tableLabel(node))}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="mt-3 overflow-x-auto rounded-md border first:mt-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {/*
         * Gaya sel di tabel (sekali, bukan per sel: baris tabel bisa ribuan). Perataan kolom (:-:) tiba
         * sebagai style text-align per sel dan menang atas rata kiri ini. Kata tidak dipatah per huruf
         * (induk overflow-wrap:anywhere) — tabel meluap lalu digulir.
         */}
        <table className="w-full border-collapse text-sm [overflow-wrap:normal] [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:min-w-28 [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium">
          {children}
        </table>
      </div>
    ),
    th: ({ style, children }) => (
      <th scope="col" style={style}>
        {children}
      </th>
    ),
  };
  return (
    <div className="min-w-0 text-sm [overflow-wrap:anywhere]" data-testid="guide-markdown">
      <Markdown
        remarkPlugins={[remarkNoHtml, remarkTable, [remarkShiftHeadings, headingOffset]]}
        rehypePlugins={[[rehypeSanitize, SCHEMA], rehypeRegionNames]}
        urlTransform={(url, key) => guideUrl(url, key, origins)}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
