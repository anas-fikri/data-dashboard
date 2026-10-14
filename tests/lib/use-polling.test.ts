import { describe, expect, it } from "vitest";
import { finalInitial } from "@/lib/hooks/use-polling";

/*
 * T-013 (akar flake e2e schema AC1): status awal dari render server bisa sudah final (ingest selesai di
 * antara bacaan halaman). Polling tidak perlu, tetapi onDone tetap dipanggil agar halaman dirender ulang.
 */
const active = (d: { status: string }) => !["UPLOADED", "INGESTING"].includes(d.status);

describe("finalInitial", () => {
  it("data awal sudah final → dilaporkan (onDone dipanggil saat mount)", () => {
    const failed = { status: "FAILED" };
    expect(finalInitial(failed, "/api/datasets/x/progress", active)).toBe(failed);
  });

  it("data awal masih berjalan, tanpa data awal, atau tanpa URL → tidak", () => {
    expect(finalInitial({ status: "INGESTING" }, "/api/x", active)).toBeNull();
    expect(finalInitial(null, "/api/x", active)).toBeNull();
    expect(finalInitial({ status: "READY" }, null, active)).toBeNull();
  });
});
