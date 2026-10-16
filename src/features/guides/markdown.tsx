import Markdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";

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
  if (!href || !/^https?:\/\//i.test(href)) return false;
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
    h1: ({ children }) => <h2 className="mt-6 text-xl font-semibold first:mt-0">{children}</h2>,
    h2: ({ children }) => <h3 className="mt-6 text-lg font-semibold first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="mt-4 text-base font-semibold first:mt-0">{children}</h4>,
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
      <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-sm">{children}</pre>
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
