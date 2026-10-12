import { describe, expect, it } from "vitest";
import { PART_SIZE, expectedPartSize, partCountOf, verifyParts } from "@/features/uploads/parts";
import { kindOf, sniff } from "@/features/uploads/sniff";

const MiB = 1024 * 1024;
const bytes = (...b: number[]) => new Uint8Array(b);

describe("rencana part", () => {
  it("1 GB = 64 part 16 MiB; part terakhir berisi sisa", () => {
    expect(partCountOf(1024 * MiB)).toBe(64);
    expect(partCountOf(40 * MiB)).toBe(3);
    expect(expectedPartSize(3, 40 * MiB)).toBe(8 * MiB);
    expect(expectedPartSize(1, 40 * MiB)).toBe(PART_SIZE);
    expect(partCountOf(1)).toBe(1);
    expect(() => expectedPartSize(4, 40 * MiB)).toThrow(RangeError);
  });

  it("verifyParts: lengkap, hilang, ukuran salah, nomor asing", () => {
    const size = 40 * MiB;
    const ok = [
      { partNumber: 1, size: 16 * MiB },
      { partNumber: 2, size: 16 * MiB },
      { partNumber: 3, size: 8 * MiB },
    ];
    expect(verifyParts(ok, size)).toEqual({ kind: "complete" });
    expect(verifyParts(ok.slice(0, 1), size)).toEqual({ kind: "missing", missing: [2, 3] });
    // Total sama (20 + 12 + 8) tetapi part 1 melebihi rencana → rusak
    expect(
      verifyParts(
        [
          { partNumber: 1, size: 20 * MiB },
          { partNumber: 2, size: 12 * MiB },
          { partNumber: 3, size: 8 * MiB },
        ],
        size,
      ).kind,
    ).toBe("corrupt");
    expect(verifyParts([...ok, { partNumber: 4, size: 1 }], size).kind).toBe("corrupt");
  });
});

describe("sniff", () => {
  it("ekstensi didukung hanya .xlsx/.csv (tidak peka kapital)", () => {
    expect(kindOf("Laporan.XLSX")).toBe("xlsx");
    expect(kindOf("data.csv")).toBe("csv");
    expect(kindOf("lama.xls")).toBeNull();
    expect(kindOf("virus.exe")).toBeNull();
  });

  it("xlsx: ZIP lolos; MZ (exe) dan OLE (.xls) ditolak dengan pesan", () => {
    expect(sniff("xlsx", bytes(0x50, 0x4b, 0x03, 0x04, 0))).toEqual({ ok: true });
    const exe = sniff("xlsx", bytes(0x4d, 0x5a, 0x90, 0));
    expect(exe.ok).toBe(false);
    const xls = sniff("xlsx", bytes(0xd0, 0xcf, 0x11, 0xe0));
    expect(!xls.ok && xls.message).toContain(".xls");
  });

  it("csv: teks lolos; UTF-16 BOM, NUL, dan ZIP ditolak; kosong ditolak", () => {
    expect(sniff("csv", new TextEncoder().encode("a;b\n1;2\n"))).toEqual({ ok: true });
    const utf16 = sniff("csv", bytes(0xff, 0xfe, 0x61, 0));
    expect(!utf16.ok && utf16.message).toContain("UTF-8");
    expect(sniff("csv", bytes(0x61, 0, 0x62)).ok).toBe(false);
    expect(sniff("csv", bytes(0x50, 0x4b, 0x03, 0x04)).ok).toBe(false);
    expect(sniff("csv", new Uint8Array()).ok).toBe(false);
  });
});
