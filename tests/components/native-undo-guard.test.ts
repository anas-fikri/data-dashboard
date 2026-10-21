import { describe, expect, it, vi } from "vitest";

/*
 * T-ev34: Ctrl/Cmd+Z bawaan peramban di luar kolom isian (mis. fokus di Select peran dialog Bagikan)
 * mengurungkan ketikan di kolom Judul widget yang tidak difokus → judul kosong tersimpan saat kolom itu
 * kehilangan fokus. Kanvas mencegah bawaan itu; di dalam kolom teks urungkan bawaan tetap jalan.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));

const { isStrayNativeUndo } = await import("@/components/dashboards/dashboard-canvas");

/** Elemen tiruan: closest() mencocokkan tag/atribut sederhana pada rantai induk. */
type Fake = { tag: string; type?: string; editable?: string; parent?: Fake };
const el = (f: Fake) => {
  const matches = (n: Fake, sel: string) =>
    sel.split(",").some((part) => {
      const p = part.trim();
      if (p === n.tag) return true;
      if (p.startsWith("[contenteditable]")) {
        return n.editable !== undefined && !(p.includes("false") && n.editable === "false");
      }
      return false;
    });
  const wrap = (n: Fake): unknown => ({
    tagName: n.tag.toUpperCase(),
    type: n.type,
    closest(sel: string) {
      for (let c: Fake | undefined = n; c; c = c.parent) if (matches(c, sel)) return wrap(c);
      return null;
    },
  });
  return wrap(f) as EventTarget;
};
const key = (over: Partial<KeyboardEvent> = {}) =>
  ({
    key: "z",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    target: el({ tag: "button" }),
    ...over,
  }) as unknown as KeyboardEvent;

describe("T-ev34: urungkan bawaan peramban di luar kolom isian dicegah", () => {
  it("Ctrl+Z / Cmd+Z / Ctrl+Y / Ctrl+Shift+Z di tombol (Select peran dialog Bagikan) → cegah", () => {
    expect(isStrayNativeUndo(key())).toBe(true);
    expect(isStrayNativeUndo(key({ ctrlKey: false, metaKey: true, key: "Z" }))).toBe(true);
    expect(isStrayNativeUndo(key({ key: "y" }))).toBe(true);
    expect(isStrayNativeUndo(key({ key: "Z", shiftKey: true }))).toBe(true);
    expect(isStrayNativeUndo(key({ target: null }))).toBe(true);
  });

  it("kotak centang/radio bukan kolom teks → tetap dicegah", () => {
    expect(isStrayNativeUndo(key({ target: el({ tag: "input", type: "checkbox" }) }))).toBe(true);
    expect(isStrayNativeUndo(key({ target: el({ tag: "input", type: "radio" }) }))).toBe(true);
  });

  it("di kolom teks (input teks, textarea, contenteditable) → urungkan bawaan tetap jalan", () => {
    expect(isStrayNativeUndo(key({ target: el({ tag: "input", type: "text" }) }))).toBe(false);
    expect(isStrayNativeUndo(key({ target: el({ tag: "input", type: "search" }) }))).toBe(false);
    expect(isStrayNativeUndo(key({ target: el({ tag: "textarea" }) }))).toBe(false);
    expect(
      isStrayNativeUndo(key({ target: el({ tag: "span", parent: { tag: "div", editable: "" } }) })),
    ).toBe(false);
    expect(isStrayNativeUndo(key({ target: el({ tag: "div", editable: "false" }) }))).toBe(true);
  });

  it("tanpa Ctrl/Cmd, dengan Alt, atau tombol lain → bukan urusan penjaga", () => {
    expect(isStrayNativeUndo(key({ ctrlKey: false }))).toBe(false);
    expect(isStrayNativeUndo(key({ altKey: true }))).toBe(false);
    expect(isStrayNativeUndo(key({ key: "c" }))).toBe(false);
  });
});
