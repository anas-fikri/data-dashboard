export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 500;
export const DATASETS_PER_USER = 50;

export type DatasetField = "name" | "description" | "confirm";

export type ValidationResult =
  | { ok: true; name: string; nameKey: string; description: string | null }
  | { ok: false; field: DatasetField; message: string };

/** Nama ternormalisasi untuk keunikan per pemilik: trim, spasi ganda dirapatkan, lowercase. */
export function nameKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateDatasetInput(nameRaw: unknown, descriptionRaw: unknown): ValidationResult {
  const name = typeof nameRaw === "string" ? nameRaw.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, field: "name", message: "Beri nama dataset." };
  // Karakter kontrol/format (mis. U+202E pembalik arah teks) bisa menipu tampilan nama saat dibagikan.
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return { ok: false, field: "name", message: "Nama mengandung karakter yang tidak diizinkan." };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, field: "name", message: `Nama maksimal ${NAME_MAX} karakter.` };
  }
  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim() ? descriptionRaw.trim() : null;
  if (description && description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      field: "description",
      message: `Deskripsi maksimal ${DESCRIPTION_MAX} karakter.`,
    };
  }
  return { ok: true, name, nameKey: nameKeyOf(name), description };
}

/** ID cuid: huruf kecil + angka, 20–32 karakter. Ditolak sebelum menyentuh DB. */
export function isIdShape(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{20,32}$/.test(value);
}
