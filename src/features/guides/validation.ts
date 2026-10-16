import { z } from "zod";

/** Peran sasaran artikel (nilai enum Prisma GuideRole). */
export const GUIDE_ROLES = ["OWNER", "EDITOR", "VIEWER", "ADMIN", "ALL"] as const;
export type GuideRoleValue = (typeof GUIDE_ROLES)[number];
/** Halaman bantuan kontekstual (enum Prisma GuideContext). */
export const GUIDE_CONTEXTS = ["UPLOAD", "SCHEMA", "BUILDER"] as const;
export type GuideContextValue = (typeof GUIDE_CONTEXTS)[number];

export const GUIDE_TITLE_MAX = 120;
export const GUIDE_SLUG_MAX = 80;
/** Batas isi markdown (±50 ribu karakter ≈ 25 halaman). */
export const GUIDE_BODY_MAX = 50_000;

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
      .max(
        GUIDE_BODY_MAX,
        `Isi paling panjang ${GUIDE_BODY_MAX.toLocaleString("id-ID")} karakter.`,
      ),
  })
  .strict();
export type GuideInput = z.infer<typeof guideInputSchema>;

export const cuidSchema = z.string().regex(/^[a-z0-9]{20,32}$/);
