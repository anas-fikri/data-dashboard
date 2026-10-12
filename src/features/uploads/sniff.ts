/*
 * Validasi format dari 64 KB pertama file (flow-kerja B2). Fungsi murni: dipakai browser (pra-cek UX,
 * sebelum mengunggah apa pun) dan server (setelah complete, sumber kebenaran).
 * - xlsx: ZIP (local file header "PK\x03\x04"). Struktur penuh diverifikasi worker saat membuka.
 * - csv: tidak punya magic bytes → teks tanpa byte NUL; BOM UTF-16 ditolak (minta simpan ulang UTF-8).
 */

export const SNIFF_BYTES = 64 * 1024;

export type UploadKind = "xlsx" | "csv";

export type SniffResult = { ok: true } | { ok: false; message: string };

/** Ekstensi yang diizinkan, dari nama file (tidak peka kapital). null = tidak didukung. */
export function kindOf(name: string): UploadKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export function sniff(kind: UploadKind, head: Uint8Array): SniffResult {
  if (head.length === 0) return { ok: false, message: "File kosong. Pilih file yang berisi data." };

  if (kind === "xlsx") {
    if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return { ok: true };
    if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])) {
      return {
        ok: false,
        message:
          "Ini file Excel lama (.xls) atau file terenkripsi. Buka di Excel lalu simpan sebagai Buku Kerja Excel (.xlsx) tanpa kata sandi.",
      };
    }
    return {
      ok: false,
      message:
        "Isi file bukan Buku Kerja Excel (.xlsx). Buka di Excel lalu simpan ulang sebagai .xlsx.",
    };
  }

  if (startsWith(head, [0xff, 0xfe]) || startsWith(head, [0xfe, 0xff])) {
    return {
      ok: false,
      message:
        "File CSV memakai encoding UTF-16. Simpan ulang sebagai CSV UTF-8 (Excel: CSV UTF-8 (Comma delimited)).",
    };
  }
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    return {
      ok: false,
      message: "Isi file adalah Buku Kerja Excel. Ubah ekstensinya menjadi .xlsx lalu unggah lagi.",
    };
  }
  if (head.includes(0)) {
    return { ok: false, message: "Isi file bukan teks CSV. Ekspor ulang data sebagai CSV UTF-8." };
  }
  return { ok: true };
}
