import { describe, expect, it } from "vitest";
import { toneOptions } from "@/components/dashboards/status-fields";

/* Pilihan Penilaian warna (v1.11.0, review #1): "Tanpa warna" harus bisa disimpan sebagai "none". */
const values = (o: { value: string }[]) => o.map((x) => x.value);
const labelOf = (o: { value: string; label: string }[], v: string) =>
  o.find((x) => x.value === v)?.label;

describe("toneOptions", () => {
  it("editor pivot tersimpan (di luar dashboard): ikut bawaan, Tanpa warna (none), naik, turun", () => {
    const o = toneOptions(undefined, undefined, true);
    expect(values(o)).toEqual(["inherit", "none", "up", "down"]);
    expect(labelOf(o, "none")).toBe("Tanpa warna");
    expect(labelOf(o, "inherit")).toMatch(/Ikuti penilaian bawaan dashboard/);
  });
  it("dashboard dengan bawaan: Ikuti dashboard (…), Tanpa warna, naik, turun", () => {
    const o = toneOptions("up", undefined, false);
    expect(values(o)).toEqual(["inherit", "none", "up", "down"]);
    expect(labelOf(o, "inherit")).toBe("Ikuti dashboard (makin tinggi makin baik)");
  });
  it("dashboard tanpa bawaan: pilihan lama; 'none' tersimpan tetap ditampilkan", () => {
    expect(values(toneOptions(undefined, undefined, false))).toEqual(["inherit", "up", "down"]);
    expect(values(toneOptions(undefined, "none", false))).toEqual([
      "inherit",
      "none",
      "up",
      "down",
    ]);
  });
});
