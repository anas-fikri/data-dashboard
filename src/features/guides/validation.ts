import { z } from "zod";

/** Peran sasaran artikel (nilai enum Prisma GuideRole). */
export const GUIDE_ROLES = ["OWNER", "EDITOR", "VIEWER", "ADMIN", "ALL"] as const;
export type GuideRoleValue = (typeof GUIDE_ROLES)[number];
/** Halaman bantuan kontekstual (enum Prisma GuideContext). */
export const GUIDE_CONTEXTS = ["UPLOAD", "SCHEMA", "BUILDER"] as const;
export type GuideContextValue = (typeof GUIDE_CONTEXTS)[number];

export const GUIDE_TITLE_MAX = 120;
export const GUIDE_SLUG_MAX = 80;
/** Batas isi markdown (±3.000 kata). Penguraian penekanan kuadratik: 50 ribu bisa > 2 s (review R2). */
export const GUIDE_BODY_MAX = 20_000;
/** Tanda * / _ per paragraf dan tingkat kutipan/daftar per baris (penguraian bertingkat rekursif). */
const EMPHASIS_MAX = 200;
const DEPTH_MAX = 12;
/** Baris per artikel: paragraf lanjutan malas dalam kutipan/daftar kuadratik per baris (review R3-1). */
const LINE_MAX = 2_000;
/** Awalan kontainer satu baris: spasi lalu > atau penanda daftar, berulang. */
const PREFIX = /^(?:[ \t]*(?:>|[-*+](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$)))*/;

/**
 * Masalah struktur markdown yang membuat render lambat atau melempar (mis. ">" × 2000, "*a" × 10 ribu),
 * selain itu null. Linear tanpa mengurai, dipakai saat simpan dan sebelum render (data lama).
 */
export function guideBodyProblem(md: string): string | null {
  // Pemisah baris sama dengan pengurai markdown: \r\n, \n, atau \r tunggal (review R2-2).
  for (const para of md.split(/(?:\r\n?|\n)[ \t>]*(?:\r\n?|\n)/)) {
    if ((para.match(/[*_]/g)?.length ?? 0) > EMPHASIS_MAX)
      return `Terlalu banyak tanda * atau _ dalam satu paragraf (maks. ${EMPHASIS_MAX}); pisahkan dengan baris kosong.`;
  }
  const lines = md.split(/\r\n?|\n/);
  if (lines.length > LINE_MAX)
    return `Terlalu banyak baris (maks. ${LINE_MAX.toLocaleString("id-ID")}); pecah menjadi beberapa artikel.`;
  for (const line of lines) {
    const prefix = PREFIX.exec(line)?.[0] ?? "";
    const marks = prefix.replace(/[ \t]/g, "").replace(/\d+/g, "").length;
    const indent = prefix.replace(/\t/g, "    ").replace(/[^ ]/g, "").length;
    if (marks + Math.floor(indent / 2) > DEPTH_MAX)
      return `Kutipan atau daftar bersarang terlalu dalam (maks. ${DEPTH_MAX} tingkat).`;
  }
  return null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug dari judul: huruf kecil ASCII, angka, tanda hubung (aksen dibuang). */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, GUIDE_SLUG_MAX)
    .replace(/-+$/, "");
}

/** Isi artikel dari editor admin (T-020). */
export const guideInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Judul wajib diisi.")
      .max(GUIDE_TITLE_MAX, `Judul paling panjang ${GUIDE_TITLE_MAX} karakter.`),
    slug: z
      .string()
      .trim()
      .min(1, "Slug wajib diisi.")
      .max(GUIDE_SLUG_MAX, `Slug paling panjang ${GUIDE_SLUG_MAX} karakter.`)
      .regex(SLUG, "Slug hanya huruf kecil, angka, dan tanda hubung (mis. unggah-data)."),
    role: z.enum(GUIDE_ROLES, { message: "Pilih peran." }),
    contextKey: z.enum(GUIDE_CONTEXTS).nullable(),
    bodyMarkdown: z
      .string()
      .max(GUIDE_BODY_MAX, `Isi paling panjang ${GUIDE_BODY_MAX.toLocaleString("id-ID")} karakter.`)
      .superRefine((v, ctx) => {
        const problem = guideBodyProblem(v);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
  })
  .strict();
export type GuideInput = z.infer<typeof guideInputSchema>;

export const cuidSchema = z.string().regex(/^[a-z0-9]{20,32}$/);
