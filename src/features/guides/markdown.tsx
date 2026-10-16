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

export function GuideMarkdown({
  markdown,
  origins,
}: {
  markdown: string;
  /** Origin app + storage publik (gambar boleh dari sini; tautan ke sini bukan "eksternal"). */
  origins: readonly string[];
}) {
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
    // Judul artikel = h2 (text-lg); judul di isi turun satu tingkat dan lebih kecil dari judul artikel.
    h1: ({ children }) => <h3 className="mt-6 text-base font-semibold first:mt-0">{children}</h3>,
    h2: ({ children }) => <h4 className="mt-5 text-sm font-semibold first:mt-0">{children}</h4>,
    h3: ({ children }) => <h5 className="mt-4 text-sm font-semibold first:mt-0">{children}</h5>,
    h4: ({ children }) => <h6 className="mt-4 text-sm font-medium first:mt-0">{children}</h6>,
    h5: ({ children }) => <h6 className="mt-4 text-sm font-medium first:mt-0">{children}</h6>,
    h6: ({ children }) => <h6 className="mt-4 text-sm font-medium first:mt-0">{children}</h6>,
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
        rehypePlugins={[[rehypeSanitize, SCHEMA]]}
        urlTransform={(url, key) => guideUrl(url, key, origins)}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
