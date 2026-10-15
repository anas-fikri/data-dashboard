import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { canEdit, roleOf } = await import("@/features/sharing/access");

const row = (ownerId: string, shares: ("VIEWER" | "EDITOR")[], orgShared = false) => ({
  orgShared,
  dataset: { ownerId },
  shares: shares.map((role) => ({ role })),
});

describe("roleOf (T-016)", () => {
  it("pemilik dataset selalu OWNER, apa pun share-nya", () => {
    expect(roleOf("u1", row("u1", ["VIEWER"], true))).toBe("OWNER");
  });
  it("share EDITOR mengalahkan share organisasi (VIEWER)", () => {
    expect(roleOf("u2", row("u1", ["EDITOR"], true))).toBe("EDITOR");
  });
  it("share VIEWER atau organisasi → VIEWER", () => {
    expect(roleOf("u2", row("u1", ["VIEWER"]))).toBe("VIEWER");
    expect(roleOf("u2", row("u1", [], true))).toBe("VIEWER");
  });
  it("tanpa pemilik/share/organisasi → null (404)", () => {
    expect(roleOf("u2", row("u1", []))).toBeNull();
  });
  it("canEdit hanya OWNER dan EDITOR", () => {
    expect([canEdit("OWNER"), canEdit("EDITOR"), canEdit("VIEWER"), canEdit(null)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
