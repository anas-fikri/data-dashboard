import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * T-0vjt AC2: galat segmen /panduan dan /admin/panduan (error.tsx) — judul halaman + pesan tanpa detail +
 * tombol "Coba lagi" yang memanggil retry Next. Tanpa DOM: useTransition dipalsukan agar komponen bisa
 * dipanggil langsung dan onClick tombolnya dijalankan.
 */
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useTransition: () => [false, (fn: () => void) => fn()],
}));

const { GuideError } = await import("@/components/guides/guide-error");
const { default: GuidesError } = await import("@/app/(app)/panduan/error");
const { default: AdminGuidesError } = await import("@/app/(app)/admin/panduan/error");

const error = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { digest: "123" });

/** Elemen pertama di pohon (tanpa merender) yang anaknya persis `text`. */
function findByText(node: ReactNode, text: string): ReactElement<{ onClick?: () => void }> | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    if (Array.isArray(node)) {
      for (const n of node) {
        const hit = findByText(n, text);
        if (hit) return hit;
      }
    }
    return null;
  }
  if (node.props.children === text) return node as ReactElement<{ onClick?: () => void }>;
  return findByText(node.props.children, text);
}

describe("galat segmen panduan (T-0vjt)", () => {
  it("/panduan: judul h1, pesan alert tanpa detail galat, tombol Coba lagi", () => {
    const out = renderToStaticMarkup(createElement(GuidesError, { error, retry: () => {} }));
    expect(out).toMatch(/<h1[^>]*>Panduan penggunaan<\/h1>/);
    expect(out).toMatch(/role="alert"[\s\S]*Panduan gagal dimuat\./);
    expect(out).toMatch(/<button[^>]*>[\s\S]*Coba lagi<\/button>/);
    expect(out).not.toContain("ECONNREFUSED");
  });

  it("/admin/panduan: eyebrow Admin + judul Panduan", () => {
    const out = renderToStaticMarkup(createElement(AdminGuidesError, { error, retry: () => {} }));
    expect(out).toMatch(/<a[^>]*href="\/admin"[^>]*>Admin<\/a>/);
    expect(out).toMatch(/<h1[^>]*>Panduan<\/h1>/);
    expect(out).toContain("Artikel panduan gagal dimuat.");
    expect(out).not.toContain("ECONNREFUSED");
  });

  it("Coba lagi memanggil retry sekali", () => {
    const retry = vi.fn();
    const tree = GuideError({ title: "Panduan penggunaan", what: "Panduan", retry });
    const button = findByText(tree, "Coba lagi");
    expect(button).not.toBeNull();
    button!.props.onClick!();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
