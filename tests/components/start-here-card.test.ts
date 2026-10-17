import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-exfc AC3: kartu "Mulai di sini" hanya untuk pengguna yang benar-benar baru — admin dan pemilik
 * dataset (pemilik lama) tidak melihatnya walau belum membaca artikel apa pun.
 */
const m = vi.hoisted(() => ({
  hasReadAny: vi.fn(async () => false),
  guideRolesFor: vi.fn(async () => ["OWNER"]),
  firstGuide: vi.fn(async (): Promise<{ slug: string; title: string } | null> => ({
    slug: "mulai",
    title: "Mulai memakai aplikasi",
  })),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/features/guides/reader", async (orig) => ({
  ...(await orig<typeof import("@/features/guides/reader")>()),
  ...m,
}));

const { StartHereCard } = await import("@/components/guides/start-here-card");

const render = async (props: { isAdmin?: boolean; ownsDataset?: boolean }) => {
  const el = await StartHereCard({
    userId: "u1",
    isAdmin: props.isAdmin ?? false,
    ownsDataset: props.ownsDataset ?? false,
  });
  return el ? renderToStaticMarkup(el as ReactElement) : "";
};

describe("StartHereCard (T-exfc)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pengguna baru (bukan admin, tanpa dataset, belum membaca) → kartu menuju artikel pertama", async () => {
    const out = await render({});
    expect(out).toContain('data-testid="start-here"');
    expect(out).toContain('href="/panduan/mulai"');
  });

  it("admin atau pemilik dataset yang belum membaca → tidak tampil", async () => {
    expect(await render({ isAdmin: true })).toBe("");
    expect(await render({ ownsDataset: true })).toBe("");
    expect(m.firstGuide).not.toHaveBeenCalled();
    // Jawaban sudah pasti: tanpa query status baca.
    expect(m.hasReadAny).not.toHaveBeenCalled();
  });

  it("sudah membaca satu artikel, atau belum ada artikel terbit → tidak tampil", async () => {
    m.hasReadAny.mockResolvedValueOnce(true);
    expect(await render({})).toBe("");
    m.firstGuide.mockResolvedValueOnce(null);
    expect(await render({})).toBe("");
  });
});
