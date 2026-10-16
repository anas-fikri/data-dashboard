import Markdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import { GUIDE_BODY_MAX, guideBodyProblem } from "./validation";

/*
 * Render markdown artikel panduan (T-020), dipakai halaman /panduan dan pratinjau editor admin. Tiga
 * lapis: (1) HTML mentah di markdown TIDAK dirender (tanpa rehype-raw) — <script>, <iframe>, <object>,
 * <form>, <style> tidak pernah menjadi elemen; (2) rehype-sanitize skema allowlist (GitHub) dengan
 * protokol href hanya http/https/mailto; (3) guideUrl: href javascript:/data:/lainnya dibuang, gambar
 * hanya dari path relatif aplikasi atau origin yang diizinkan (app + storage). Tautan ke origin lain
 * mendapat rel="noopener noreferrer".
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

interface MdNode {
  type: string;
  depth?: number;
  children?: MdNode[];
}

/**
 * Plugin remark: tingkat judul relatif terhadap judul teratas di isi, lalu + offset — isi yang dimulai
 * dari "##" tidak melompat tingkat (h1 → h3) di bawah judul artikel (review T-022 D2).
 */
function remarkShiftHeadings(offset: number) {
  return (tree: MdNode) => {
    const heads: MdNode[] = [];
    const walk = (n: MdNode) => {
      if (n.type === "heading") heads.push(n);
      n.children?.forEach(walk);
    };
    walk(tree);
    const top = Math.min(...heads.map((h) => h.depth ?? 1));
    for (const h of heads) h.depth = Math.min(6, (h.depth ?? 1) - top + 1 + offset);
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
    pre: ({ children }) => (
      // tabIndex: blok kode yang meluap bisa digulir dengan keyboard (axe scrollable-region-focusable).
      <pre
        role="region"
        aria-label="Blok kode"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {children}
      </pre>
    ),
  };
  return (
    <div className="min-w-0 text-sm [overflow-wrap:anywhere]" data-testid="guide-markdown">
      <Markdown
        remarkPlugins={[remarkNoHtml, [remarkShiftHeadings, headingOffset]]}
        rehypePlugins={[[rehypeSanitize, SCHEMA]]}
        urlTransform={(url, key) => guideUrl(url, key, origins)}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
