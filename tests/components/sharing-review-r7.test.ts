import { describe, expect, it, vi } from "vitest";

/*
 * Perbaikan review T-016 putaran 7: konfirmasi "Bagikan" hanya tampil selama masih benar — orang itu
 * dicabut atau perannya diubah di daftar akses → baris hilang (CL-1/UI-2). Posisinya (tepat di bawah
 * kolom cari, terlihat di ponsel walau ada peringatan, UI-1) diuji e2e sharing.spec.ts.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/features/sharing/actions", () => ({
  listSharesAction: vi.fn(),
  searchShareUsersAction: vi.fn(),
  grantShareAction: vi.fn(),
  revokeShareAction: vi.fn(),
  setOrgShareAction: vi.fn(),
  setShareRoleAction: vi.fn(),
}));

const { grantStillTrue } = await import("@/components/sharing/share-add");

const added = { userId: "u-c", email: "c@pcp.co.id", role: "VIEWER" as const };

describe("grantStillTrue (review T-016 R7)", () => {
  it("tampil selama orang itu masih punya peran yang sama", () => {
    expect(grantStillTrue(added, new Map([["u-c", "VIEWER"]]))).toBe(true);
  });
  it("dicabut di daftar akses → tidak tampil", () => {
    expect(grantStillTrue(added, new Map([["u-b", "VIEWER"]]))).toBe(false);
  });
  it("dijadikan editor di daftar akses → tidak tampil (teks 'bisa melihat' sudah salah)", () => {
    expect(grantStillTrue(added, new Map([["u-c", "EDITOR"]]))).toBe(false);
  });
  it("belum ada yang dibagikan → tidak tampil", () => {
    expect(grantStillTrue(null, new Map([["u-c", "VIEWER"]]))).toBe(false);
  });
});
