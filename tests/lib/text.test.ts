import { describe, expect, it } from "vitest";
import { cleanLine, cleanName, escapeLike, looksLikeEmail } from "@/lib/text";

/* T-019 review: nama tampilan tidak boleh bisa menyamar (bidi/kontrol), wildcard LIKE literal. */
describe("cleanName / cleanLine", () => {
  it("membuang karakter kontrol dan format, termasuk penimpa arah teks (RLO, isolat)", () => {
    expect(cleanName("\u202Emoc.sserpxepcp@4-u")).toBe("moc.sserpxepcp@4-u");
    for (const c of [
      "\u202A",
      "\u202B",
      "\u202C",
      "\u202D",
      "\u2066",
      "\u2067",
      "\u2068",
      "\u2069",
    ]) {
      expect(cleanName(`Bu${c}di`)).toBe("Budi");
    }
    expect(cleanName("Budi\u200B\u200E\u00AD\u0000\u0007 Santoso")).toBe("Budi Santoso");
  });

  it("baris baru/tab/spasi berlebih jadi satu spasi, ujung di-trim, NFC", () => {
    expect(cleanName("  Budi\n\tSantoso \u3000 ")).toBe("Budi Santoso");
    expect(cleanName("Jose\u0301")).toBe("Jos\u00E9");
  });

  it("kosong / hanya karakter tak terlihat / bukan string → null", () => {
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("\u202E\u2066")).toBeNull();
    expect(cleanName(null)).toBeNull();
    expect(cleanName(42)).toBeNull();
  });

  it("dipotong per code point (emoji tidak terbelah), maks 80", () => {
    const out = cleanName(`${"a".repeat(79)}\u{1F600}\u{1F600}`)!;
    expect(Array.from(out)).toHaveLength(80);
    expect(out.endsWith("\u{1F600}")).toBe(true);
    expect(cleanLine("abc def", 4)).toBe("abc");
  });
});

describe("looksLikeEmail", () => {
  it("menolak nama dengan @ (termasuk varian lebar penuh/kecil)", () => {
    expect(looksLikeEmail("security-5@pcpexpress.com (Gudang)")).toBe(true);
    expect(looksLikeEmail("budi\uFF20pcpexpress.com")).toBe(true);
    expect(looksLikeEmail("budi\uFE6Bpcpexpress.com")).toBe(true);
    expect(looksLikeEmail("Budi Santoso (Gudang Jakarta)")).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escape \\, %, _ dengan backslash (escape bawaan LIKE PostgreSQL)", () => {
    expect(escapeLike("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
    expect(escapeLike("budi.santoso")).toBe("budi.santoso");
  });
});
