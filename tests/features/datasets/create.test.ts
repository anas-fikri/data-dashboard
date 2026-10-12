import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

/* createDataset: transaksi yang habis waktu menunggu lock (P2028) → BUSY, bukan error 500. */
const $transaction = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { $transaction } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/objects", () => ({ deleteDatasetObjects: vi.fn() }));
vi.mock("@/lib/queue/versions", () => ({ cancelVersionJobs: vi.fn() }));

const { createDataset } = await import("@/features/datasets/service");

describe("createDataset", () => {
  it("P2028 (timeout transaksi) → BUSY dengan pesan coba lagi", async () => {
    $transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Transaction API error", {
        code: "P2028",
        clientVersion: "6.12.0",
      }),
    );
    const r = await createDataset("owner1", "Penjualan", "");
    expect(r).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("error lain tetap dilempar", async () => {
    $transaction.mockRejectedValueOnce(new Error("boom"));
    await expect(createDataset("owner1", "Penjualan", "")).rejects.toThrow("boom");
  });
});
