import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/* T-003: profil dataset (buat, daftar, label, akses pemilik, hapus dua langkah). */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("ds-owner");
const OTHER = uniqueEmail("ds-other");

function fixture(cmd: "seed" | "count", id: string): Record<string, unknown> {
  return JSON.parse(execFileSync("node", ["scripts/dev-dataset-fixture.mjs", cmd, id]).toString());
}

async function createUser(browser: Browser, request: APIRequestContext, email: string) {
  const p = await browser.newPage();
  await registerAndVerify(p, request, email);
  await p.close();
}

async function createDataset(page: Page, name: string, description = ""): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  if (description) await page.getByLabel("Deskripsi").fill(description);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}$/);
  return page.url().split("/").pop()!;
}

test.describe("dataset", () => {
  test.beforeAll(async ({ browser, request }) => {
    await createUser(browser, request, OWNER);
    await createUser(browser, request, OTHER);
  });

  test("buat dataset → muncul di daftar dengan label Kosong; nama duplikat ditolak", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    await page.goto("/datasets");
    await expect(page.getByText("Belum ada dataset")).toBeVisible();

    const id = await createDataset(page, "Penjualan Cabang 2026", "Rekap bulanan semua cabang");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Penjualan Cabang 2026");
    await page.goto("/datasets");
    const row = page.getByTestId("dataset-row").filter({ hasText: "Penjualan Cabang 2026" });
    await expect(row).toHaveAttribute("href", `/datasets/${id}`);
    await expect(row.getByTestId("dataset-status")).toHaveText(/Kosong/);

    // Nama sama (beda kapital/spasi) ditolak di field nama, isian dipertahankan
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill("  penjualan   CABANG 2026 ");
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page.getByText("Anda sudah punya dataset dengan nama ini.")).toBeVisible();
    await expect(page.getByLabel("Nama dataset")).toBeFocused();
    await expect(page.getByLabel("Nama dataset")).toHaveValue("  penjualan   CABANG 2026 ");

    // Nama kosong
    await page.getByLabel("Nama dataset").fill("");
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page.getByText("Beri nama dataset.")).toBeVisible();
  });

  test("ubah nama dan deskripsi tersimpan", async ({ page }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Draft Gudang");
    await page.getByLabel("Nama dataset").fill("Stok Gudang Jakarta");
    await page.getByLabel("Deskripsi").fill("Posisi stok harian");
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("Perubahan disimpan.");
    await page.goto(`/datasets/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stok Gudang Jakarta");
    await expect(page.getByText("Posisi stok harian").first()).toBeVisible();
  });

  test("profil milik user lain: halaman 404 dan Server Action NOT_FOUND tanpa perubahan", async ({
    page,
    browser,
  }) => {
    // Pemilik membuat dataset
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await apiLogin(owner, OWNER);
    const victimId = await createDataset(owner, "Rahasia Keuangan");

    // User lain membuka URL langsung → 404
    await apiLogin(page, OTHER);
    const res = await page.goto(`/datasets/${victimId}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");

    // User lain memanggil Server Action ubah dengan id milik pemilik → NOT_FOUND
    const ownId = await createDataset(page, "Milik Sendiri");
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"] && !captured) {
        captured = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
      }
    });
    await page.getByLabel("Nama dataset").fill("Diretas");
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect.poll(() => captured !== null).toBe(true);
    const req = captured!;
    const forged = await page.request.fetch(req.url, {
      method: "POST",
      headers: req.headers,
      data: req.body.replaceAll(ownId, victimId),
    });
    expect(await forged.text()).toContain("NOT_FOUND");

    await owner.goto(`/datasets/${victimId}`);
    await expect(owner.getByRole("heading", { level: 1 })).toHaveText("Rahasia Keuangan");
    await ownerCtx.close();
  });

  test("versi READY aktif + terbaru FAILED → Siap + badge Gagal dengan pesan", async ({ page }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Penjualan Bulanan");
    fixture("seed", id);
    await page.goto("/datasets");
    const row = page.getByTestId("dataset-row").filter({ hasText: "Penjualan Bulanan" });
    await expect(row.getByTestId("dataset-status")).toContainText("Siap");
    await expect(row.locator('[data-badge="failed"]')).toHaveText(/Gagal/);
    await page.goto(`/datasets/${id}`);
    await expect(page.getByTestId("dataset-status-message")).toHaveText(
      "Sheet 'Oktober' baris 1.204: file rusak, tidak bisa dibaca.",
    );
  });

  test("hapus dua langkah: konfirmasi nama → profil, versi, dashboard hilang", async ({ page }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Akan Dihapus");
    fixture("seed", id);
    expect(fixture("count", id)).toEqual({ versions: 2, dashboards: 1, exists: true });

    await page.goto(`/datasets/${id}`);
    await page.getByRole("button", { name: "Hapus dataset" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 dashboard");
    const confirm = dialog.getByRole("button", { name: "Hapus permanen" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Ketik/).fill("akan dihapus");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/datasets\?deleted=1/);
    await expect(page.getByTestId("form-alert")).toContainText("Dataset dihapus.");
    await expect(page.getByTestId("dataset-row").filter({ hasText: "Akan Dihapus" })).toHaveCount(
      0,
    );
    expect(fixture("count", id)).toEqual({ versions: 0, dashboards: 0, exists: false });
    expect((await page.goto(`/datasets/${id}`))?.status()).toBe(404);
  });

  test("batas 50 dataset tidak bisa ditembus dengan 5 permintaan paralel", async ({
    page,
    browser,
    request,
  }) => {
    const email = uniqueEmail("ds-limit");
    await createUser(browser, request, email);
    execFileSync("node", ["scripts/dev-dataset-fixture.mjs", "fill", email, "48"]);
    await apiLogin(page, email);

    // Tangkap Server Action buat dataset (dataset ke-49 lewat UI), lalu replay paralel 5×
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"] && !captured) {
        captured = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
      }
    });
    await createDataset(page, "Ke Empat Sembilan");
    await expect.poll(() => captured !== null).toBe(true);
    const req = captured!;
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        page.request.fetch(req.url, {
          method: "POST",
          headers: req.headers,
          data: req.body.replaceAll("Ke Empat Sembilan", `Paralel ${n}`),
        }),
      ),
    );
    const total = JSON.parse(
      execFileSync("node", ["scripts/dev-dataset-fixture.mjs", "total", email]).toString(),
    ) as { total: number };
    expect(total.total).toBe(50);

    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill("Satu Lagi");
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("Batas 50 dataset");
  });

  test("ponsel: daftar tanpa scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await apiLogin(page, OWNER);
    await page.goto("/datasets");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
