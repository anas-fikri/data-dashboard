import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

/*
 * T-0vjt AC2: database tidak terjangkau → layout (app) tetap merender shell (user null) agar galat dari
 * halaman jatuh ke error.tsx segmennya, bukan galat global. Galat internal Next tetap diteruskan.
 */
const { getSessionUser } = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/features/auth/session", () => ({ getSessionUser }));
vi.mock("@/components/shell/app-shell", () => ({ AppShell: () => null }));

const { default: AppLayout } = await import("@/app/(app)/layout");
const children = createElement("main");

describe("layout (app) (T-0vjt)", () => {
  it("lookup sesi gagal (database mati) → shell tanpa pengguna, tidak melempar", async () => {
    getSessionUser.mockRejectedValueOnce(new Error("Can't reach database server"));
    const el = await AppLayout({ children });
    expect(el.props).toMatchObject({ user: null, children });
  });

  it("pengguna sesi diteruskan ke shell; galat internal Next (redirect) tidak ditelan", async () => {
    const user = { id: "u1", email: "a@pcpexpress.com", name: null, isAdmin: false };
    getSessionUser.mockResolvedValueOnce(user);
    expect((await AppLayout({ children })).props).toMatchObject({ user });
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    getSessionUser.mockRejectedValueOnce(redirect);
    await expect(AppLayout({ children })).rejects.toBe(redirect);
  });
});
