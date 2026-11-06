import { z } from "zod";

/*
 * Warna status (rencana v1.7.0): tiap nilai pivot/grafik boleh punya arah penilaian, dan widget
 * boleh memilih template warna. Skema sudah diterima sejak v1.6.2 (diabaikan di sana) agar rollback
 * dari v1.7.x tidak membuat widget berwarna menjadi "Pengaturan widget tidak valid".
 */

/** "up" = makin tinggi makin baik (mis. checkpoint tepat waktu); "down" = makin tinggi makin buruk (mis. klaim). */
export const TONES = ["up", "down"] as const;
export type Tone = (typeof TONES)[number];
export const toneSchema = z.enum(TONES);

/** Template warna: lembut (gaya isian Excel), tegas, ramah buta warna, atau tiga warna sendiri. */
export const COLOR_TEMPLATES = ["soft", "bold", "cvd", "custom"] as const;
export type ColorTemplate = (typeof COLOR_TEMPLATES)[number];

/** Warna custom hanya hex 6 digit (bukan teks CSS bebas). */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus kode hex #RRGGBB");

export const colorsSchema = z
  .object({
    template: z.enum(COLOR_TEMPLATES),
    /** [buruk, sedang, baik] — wajib untuk "custom", diabaikan template lain. */
    custom: z.tuple([hexColorSchema, hexColorSchema, hexColorSchema]).optional(),
  })
  .strict()
  .refine((c) => c.template !== "custom" || c.custom !== undefined, {
    message: "Template custom membutuhkan tiga warna",
    path: ["custom"],
  });
export type WidgetColors = z.infer<typeof colorsSchema>;

/**
 * Batas tetap (v1.8.0, opsional): seperti aturan angka Conditional Formatting Excel, mis. SLA tepat waktu
 * Baik ≥ 95, Perlu perhatian < 90. Angka dalam satuan yang TAMPIL (format persen: 95 = 95 %). Arah "up":
 * ≥ good = baik, < bad = perlu perhatian; "down": ≤ good = baik, > bad = perlu perhatian; sisanya sedang.
 * Tanpa batas = tiga tingkat relatif terhadap nilai lain di widget.
 */
export const targetSchema = z
  .object({ good: z.number().finite(), bad: z.number().finite() })
  .strict();
export type StatusTarget = z.infer<typeof targetSchema>;

/** Batas butuh arah, dan urutannya harus sesuai arah (up: baik ≥ buruk; down: baik ≤ buruk). */
export const targetRule = {
  check: (v: { tone?: Tone; target?: StatusTarget }) =>
    !v.target ||
    (v.tone === "up"
      ? v.target.good >= v.target.bad
      : v.tone === "down"
        ? v.target.good <= v.target.bad
        : false),
  message: "Batas warna butuh penilaian warna dan urutan yang sesuai arahnya",
  path: ["target"],
};
