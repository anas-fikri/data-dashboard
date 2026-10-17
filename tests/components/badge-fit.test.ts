import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TITLE_MIN_PX, badgeMode, headRoom } from "@/components/dashboards/badge-fit";

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

/*
 * T-2jwv: aturan headRoom dengan tata letak tiruan (lingkungan uji node, tanpa DOM): judul/lencana tidak
 * dihitung, absolut/tersembunyi dilewati, elemen fleksibel dihitung min-width, tombol kepala yang
 * disembunyikan container query membuat lencana mengalah.
 */
type Fake = {
  dataset: Record<string, string>;
  style: Record<string, string>;
  getBoundingClientRect: () => { width: number };
  children?: Fake[];
};
const el = (width: number, style: Record<string, string> = {}, dataset = {}): Fake => ({
  dataset,
  style: { display: "flex", position: "static", flexGrow: "0", minWidth: "0px", ...style },
  getBoundingClientRect: () => ({ width }),
});
const head = (width: number, children: Fake[]): HTMLElement =>
  ({
    ...el(width, {
      columnGap: "4px",
      paddingLeft: "8px",
      paddingRight: "8px",
      borderLeftWidth: "0px",
      borderRightWidth: "0px",
    }),
    children,
  }) as unknown as HTMLElement;
const title = () => el(120, {}, { headTitle: "" });
const badge = () => el(60, { position: "absolute" }, { badge: "" });
const control = (width: number, display = "inline-flex") =>
  el(width, { display }, { headControl: "" });

describe("headRoom (T-2jwv)", () => {
  beforeEach(() => vi.stubGlobal("getComputedStyle", (e: Fake) => e.style));
  afterEach(() => vi.unstubAllGlobals());

  it("lebar isi dikurangi tombol + jarak; judul dan lencana tidak dihitung", () => {
    // 300 − padding 16 − (32 + 4) − (32 + 4) = 212.
    expect(headRoom(head(300, [title(), badge(), control(32), control(32)]))).toEqual({
      room: 212,
      gap: 4,
    });
  });

  it("elemen absolut/fixed (status sr-only ekspor) dan tersembunyi biasa dilewati", () => {
    const status = el(1, { position: "absolute" });
    const hidden = el(80, { display: "none" });
    const fixed = el(50, { position: "fixed" });
    expect(headRoom(head(300, [title(), status, hidden, fixed, control(32)])).room).toBe(248);
  });

  it("elemen fleksibel ('Memperbarui…' basis 0) dihitung lebar minimumnya, bukan lebar terukur", () => {
    const stale = el(200, { flexGrow: "1", minWidth: "14px" });
    expect(headRoom(head(300, [title(), stale, control(32)])).room).toBe(300 - 16 - 18 - 36);
  });

  it("tombol kepala disembunyikan container query → ruang 0, lencana ditahan (tanpa pulau 2 px)", () => {
    const r = headRoom(head(300, [title(), control(32, "none"), control(32)]));
    expect(r.room).toBe(0);
    expect(badgeMode({ ...r, full: 60, compact: 30 })).toBe("none");
  });

  it("mode bungkus sentuh (kepala 10rem, pegangan + pengaturan 44 px) → tanpa lencana terpendek sekalipun", () => {
    // DOM nyata di pita ini: ekspor + tombol data ada tetapi disembunyikan container query → ruang 0.
    const hidden = [control(44, "none"), control(44, "none")];
    expect(headRoom(head(160, [control(44), title(), ...hidden, el(44)])).room).toBe(0);
    // Tanpa kontrol tersembunyi pun ruangnya di bawah judul 4rem + lencana terpendek.
    const r = headRoom(head(160, [control(44), title(), el(44)]));
    expect(r.room).toBe(160 - 16 - 48 - 48);
    expect(badgeMode({ ...r, full: 34, compact: 34 })).toBe("none");
  });
});
