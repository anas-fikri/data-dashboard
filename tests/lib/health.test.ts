import { describe, expect, it } from "vitest";
import { runHealthChecks, safeMessage } from "@/lib/health";

describe("runHealthChecks", () => {
  it("semua ok → status ok dengan detail per item", async () => {
    const report = await runHealthChecks([
      { name: "A", run: async () => "a ok" },
      { name: "B", run: async () => "b ok" },
    ]);
    expect(report.status).toBe("ok");
    expect(report.items.map((i) => [i.name, i.status, i.detail])).toEqual([
      ["A", "ok", "a ok"],
      ["B", "ok", "b ok"],
    ]);
  });

  it("satu gagal tidak menghentikan yang lain dan status menjadi fail", async () => {
    const report = await runHealthChecks([
      { name: "A", run: async () => "a ok" },
      {
        name: "B",
        run: async () => {
          throw new Error("koneksi ditolak");
        },
      },
    ]);
    expect(report.status).toBe("fail");
    expect(report.items[0]?.status).toBe("ok");
    expect(report.items[1]).toMatchObject({ status: "fail", detail: "koneksi ditolak" });
  });

  it("pemeriksaan yang menggantung dibatasi timeout", async () => {
    const report = await runHealthChecks(
      [{ name: "Lambat", run: () => new Promise<string>(() => {}) }],
      20,
    );
    expect(report.items[0]).toMatchObject({ status: "fail" });
    expect(report.items[0]?.detail).toMatch(/timeout/);
  });
});

describe("safeMessage", () => {
  it("menyembunyikan URL koneksi yang mungkin memuat kredensial", () => {
    const msg = safeMessage(new Error("gagal ke postgresql://app:rahasia@db:5432/x karena X"));
    expect(msg).not.toContain("rahasia");
    expect(msg).toContain("[url]");
  });

  it("hanya baris pertama dan dipotong", () => {
    const msg = safeMessage(new Error(`${"a".repeat(300)}\nstack line`));
    expect(msg.length).toBeLessThanOrEqual(160);
    expect(msg).not.toContain("stack");
  });
});
