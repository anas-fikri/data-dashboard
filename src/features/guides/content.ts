import { guideInputSchema, type GuideInput } from "./validation";

/*
 * Isi awal panduan (T-xfzy) disimpan di repo sebagai content/panduan/NN-<slug>.md dengan frontmatter
 * sederhana (title, slug, role, context). Fungsi murni: dipakai skrip seed dan uji isi.
 */

const FRONT = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/** Urai satu berkas artikel; galat menyebut kolom yang salah (berkas di repo, bukan input user). */
export function parseGuideFile(text: string, file = "artikel"): GuideInput {
  const m = FRONT.exec(text.replace(/\r\n?/g, "\n"));
  if (!m) throw new Error(`${file}: frontmatter --- tidak ditemukan`);
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  const r = guideInputSchema.safeParse({
    title: meta.title ?? "",
    slug: meta.slug ?? "",
    role: meta.role ?? "",
    contextKey: meta.context ? meta.context : null,
    bodyMarkdown: m[2]!.trim(),
  });
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`${file}: ${issue?.path.join(".") || "isi"} — ${issue?.message}`);
  }
  return r.data;
}
