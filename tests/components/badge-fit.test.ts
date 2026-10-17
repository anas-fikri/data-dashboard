import { describe, expect, it } from "vitest";
import { TITLE_MIN_PX, badgeMode } from "@/components/dashboards/badge-fit";

/*
 * T-7ke3: lencana kategori dipilih dari ruang kepala yang terukur — judul selalu ≥ 4rem (64 px), untuk
 * tombol kepala 32/44 px dan teks lencana sepanjang apa pun. Lebar lencana di bawah diukur di Chromium
 * (text-xs tabular-nums + px-1): "9.999 dari 9.999" ± 104 px, "9.999/9.999" ± 79 px, "1.000 teratas" ± 85.
 */
const GAP = 4;

describe("badgeMode", () => {
  it("penuh bila judul tetap ≥ 64 px setelah lencana + jarak; lalu ringkas; lalu tanpa lencana", () => {
    const full = 104;
    const compact = 79;
    expect(badgeMode({ room: TITLE_MIN_PX + full + GAP, full, compact, gap: GAP })).toBe("full");
    expect(badgeMode({ room: TITLE_MIN_PX + full + GAP - 1, full, compact, gap: GAP })).toBe(
      "compact",
    );
    expect(badgeMode({ room: TITLE_MIN_PX + compact + GAP, full, compact, gap: GAP })).toBe(
      "compact",
    );
    expect(badgeMode({ room: TITLE_MIN_PX + compact + GAP - 1, full, compact, gap: GAP })).toBe(
      "none",
    );
  });

  it("lencana terpanjang ('1.000 teratas' tanpa bentuk ringkas lebih pendek) tetap menghormati batas judul", () => {
    const top = 85;
    expect(badgeMode({ room: 152, full: top, compact: top, gap: GAP })).toBe("none");
    expect(badgeMode({ room: 153, full: top, compact: top, gap: GAP })).toBe("full");
  });

  it("lebar pecahan dibulatkan ke arah aman: '2/12' 34,34 px di ruang 102 px → tanpa lencana (judul 63,66 < 64)", () => {
    // Review desain T-7ke3 B2: offsetWidth membulatkan 34,34 → 34 sehingga lencana tampil dengan judul 63,66 px.
    expect(badgeMode({ room: 102, full: 60, compact: 34.34, gap: GAP })).toBe("none");
    expect(badgeMode({ room: 102.9, full: 60, compact: 34.34, gap: GAP })).toBe("none");
    // Judul sungguhan 65,06 px → ringkas.
    expect(badgeMode({ room: 103.4, full: 60, compact: 34.34, gap: GAP })).toBe("compact");
  });

  it("belum terukur (lebar 0) → tanpa lencana", () => {
    expect(badgeMode({ room: 500, full: 0, compact: 0, gap: GAP })).toBe("none");
  });
});
