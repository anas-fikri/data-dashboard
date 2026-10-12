import { execFileSync } from "node:child_process";
import { closeSync, ftruncateSync, mkdirSync, openSync, utimesSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/* T-004: unggah multipart resumable langsung ke storage (flow-kerja B2). */
test.describe.configure({ mode: "serial" });

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const MiB = 1024 * 1024;
const MAX = 1024 * MiB;
const OWNER = uniqueEmail("up-owner");
const OTHER = uniqueEmail("up-other");
const DIR = join(tmpdir(), `dd-e2e-${process.pid}`);
mkdirSync(DIR, { recursive: true });

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const MZ = [0x4d, 0x5a, 0x90, 0x00];

/** File berukuran `size`: sparse dengan header, atau penuh byte `fill` (teks). mtime tetap agar fingerprint stabil. */
function makeFile(name: string, size: number, header: number[], fill?: number): string {
  const path = join(DIR, name);
  const fd = openSync(path, "w");
  writeSync(fd, fill === undefined ? Buffer.from(header) : Buffer.alloc(size, fill));
  ftruncateSync(fd, size);
  closeSync(fd);
  utimesSync(path, new Date("2026-10-01T08:00:00Z"), new Date("2026-10-01T08:00:00Z"));
  return path;
}

function fx(...args: string[]): Record<string, unknown> {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
}

async function createUser(browser: Browser, request: APIRequestContext, email: string) {
  const p = await browser.newPage();
  await registerAndVerify(p, request, email);
  await p.close();
}

async function createDataset(page: Page, name: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function api(
  page: Page,
  method: "POST" | "DELETE",
  path: string,
  data: unknown = {},
  origin = BASE,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await page.request.fetch(path, {
    method,
    headers: { origin, "content-type": "application/json" },
    data: method === "POST" ? JSON.stringify(data) : undefined,
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

const init = (page: Page, datasetId: string, name: string, size: number, lastModified = 1) =>
  api(page, "POST", "/api/uploads", { datasetId, name, size, lastModified });

test.describe("unggah", () => {
  test.beforeAll(async ({ browser, request }) => {
    await createUser(browser, request, OWNER);
    await createUser(browser, request, OTHER);
  });

  test("xlsx 200 MB: progres tampil → UPLOADED dengan ukuran + ETag multipart, job ingest masuk antrean", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Unggah Besar");
    await expect(page.getByText("Belum ada data")).toBeVisible();

    const file = makeFile("penjualan-besar.xlsx", 200 * MiB, ZIP);
    await page.getByTestId("upload-input").setInputFiles(file);
    await expect(page.getByTestId("upload-progress")).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByText('"penjualan-besar.xlsx" terunggah.')).toBeVisible({
      timeout: 90_000,
    });

    const v = fx("latest", id);
    expect(v).toMatchObject({
      status: "UPLOADED",
      sizeBytes: 200 * MiB,
      uploadId: null,
      job: true,
    });
    expect(String(v.etag)).toMatch(/-13"?$/); // 200 MiB / 16 MiB = 13 part
    expect(fx("object", String(v.id))).toMatchObject({
      exists: true,
      contentType: "application/octet-stream",
    });

    // Setelah refresh: badge menunggu diproses, unggah baru ditahan
    await page.reload();
    await expect(page.getByTestId("dataset-status")).toContainText("Menunggu diproses");
    await expect(page.getByTestId("dataset-processing")).toBeVisible();
    await expect(page.getByTestId("upload-dropzone")).toHaveCount(0);
  });

  test("ukuran 1 GB + 1 byte → FILE_TOO_LARGE tanpa versi/multipart; Origin asing → 403", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Terlalu Besar");
    const r = await init(page, id, "raksasa.xlsx", MAX + 1);
    expect(r.status).toBe(413);
    expect(r.body.code).toBe("FILE_TOO_LARGE");
    expect(fx("latest", id)).toEqual({ exists: false });

    const forged = await api(
      page,
      "POST",
      "/api/uploads",
      { datasetId: id, name: "a.xlsx", size: 10, lastModified: 1 },
      "https://evil.example",
    );
    expect(forged.status).toBe(403);
    expect(fx("latest", id)).toEqual({ exists: false });
  });

  test("part 20 MiB pada rencana 16 MiB → complete mendeteksi, multipart di-abort, versi FAILED", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Part Nakal");
    const r = await init(page, id, "nakal.xlsx", 32 * MiB);
    expect(r.status).toBe(200);
    const versionId = String(r.body.versionId);
    expect(r.body.partCount).toBe(2);
    const uploadId = String(fx("version", versionId).uploadId);

    // Storage yang tidak menegakkan tanda tangan disimulasikan dengan unggah langsung (kredensial internal)
    fx("put-part", versionId, "1", String(20 * MiB));
    fx("put-part", versionId, "2", String(12 * MiB));

    const done = await api(page, "POST", `/api/uploads/${versionId}/complete`);
    expect(done.status).toBe(422);
    expect(done.body.code).toBe("UPLOAD_CORRUPT");
    expect(fx("version", versionId)).toMatchObject({ status: "FAILED", job: false });
    expect(fx("multipart", versionId, uploadId)).toMatchObject({ alive: false });
  });

  test(".exe berganti nama .xlsx: browser menolak lebih dulu; server menghapus objek dan FAILED INVALID_FORMAT", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "File Palsu");

    // Pra-cek di browser: tidak ada yang diunggah
    await page.getByTestId("upload-input").setInputFiles(makeFile("laporan.xlsx", 4096, MZ));
    await expect(page.locator("[data-testid=form-alert][data-tone=error]")).toContainText(
      "bukan Buku Kerja Excel",
    );
    await expect(page.locator("[data-testid=form-alert][data-tone=error]")).toBeFocused();
    expect(fx("latest", id)).toEqual({ exists: false });

    // Lewati browser: server tetap menolak setelah complete
    const r = await init(page, id, "laporan.xlsx", 4096);
    const versionId = String(r.body.versionId);
    const signed = await api(page, "POST", `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
    const url = (signed.body.urls as { url: string }[])[0]!.url;
    const body = Buffer.alloc(4096);
    body.set(MZ);
    expect((await page.request.put(url, { data: body })).status()).toBe(200);
    const done = await api(page, "POST", `/api/uploads/${versionId}/complete`);
    expect(done.status).toBe(422);
    expect(done.body.code).toBe("INVALID_FORMAT");
    expect(fx("object", versionId)).toEqual({ exists: false });
    expect(fx("version", versionId)).toMatchObject({ status: "FAILED", job: false });

    await page.reload();
    await expect(page.getByTestId("dataset-status")).toContainText("Gagal");
    await expect(page.getByTestId("upload-dropzone")).toBeVisible();
  });

  test("terputus di tengah → muat ulang → file yang sama melanjutkan dari part terakhir; user lain tidak bisa", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await apiLogin(page, OWNER);
    page.on("dialog", (d) => void d.accept());
    const id = await createDataset(page, "Unggah Putus");
    const file = makeFile("putus.csv", 40 * MiB, [], 0x61); // 16 + 16 + 8 MiB

    // Part 2 dan 3 "menggantung" (koneksi putus); part 1 lolos
    await page.route(/partNumber=(2|3)(&|$)/, () => {});
    await page.getByTestId("upload-input").setInputFiles(file);
    await expect.poll(() => fx("latest", id).exists).toBe(true);
    const versionId = String(fx("latest", id).id);
    await expect.poll(() => fx("multipart", versionId).parts, { timeout: 20_000 }).toBe(1);

    await page.reload(); // membatalkan XHR part yang tertahan
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect(page.getByTestId("upload-pending")).toContainText("putus.csv");

    const puts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes("partNumber=")) puts.push(r.url());
    });
    await page.getByTestId("upload-input").setInputFiles(file);
    await expect(page.getByText('"putus.csv" terunggah.')).toBeVisible({ timeout: 60_000 });
    expect(puts.some((u) => /partNumber=1(&|$)/.test(u))).toBe(false);
    expect(puts.length).toBe(2);
    expect(fx("version", versionId)).toMatchObject({ status: "UPLOADED", sizeBytes: 40 * MiB });

    // User lain dengan file identik: tidak bisa memulai/melanjutkan di dataset ini, tidak bisa menyentuh versinya
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await apiLogin(other, OTHER);
    expect((await init(other, id, "putus.csv", 40 * MiB)).status).toBe(404);
    expect(
      (await api(other, "POST", `/api/uploads/${versionId}/parts`, { partNumbers: [1] })).status,
    ).toBe(404);
    expect((await api(other, "POST", `/api/uploads/${versionId}/complete`)).status).toBe(404);
    expect((await api(other, "DELETE", `/api/uploads/${versionId}`)).status).toBe(404);
    await ctx.close();
  });

  test("versi INGESTING → DATASET_BUSY; halaman menahan unggah baru", async ({ page }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Sedang Diproses");
    fx("set-status", id, "INGESTING");
    const r = await init(page, id, "baru.xlsx", 2048);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("DATASET_BUSY");
    await page.reload();
    await expect(page.getByTestId("dataset-processing")).toBeVisible();
    await expect(page.getByTestId("upload-dropzone")).toHaveCount(0);
  });

  test("presigned UploadPart: Content-Length lain ditolak storage; Content-Type objek dari server", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Tanda Tangan");
    const r = await init(page, id, "kecil.csv", 1024);
    const versionId = String(r.body.versionId);
    const signed = await api(page, "POST", `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
    const url = (signed.body.urls as { url: string }[])[0]!.url;
    expect(url).toMatch(/X-Amz-SignedHeaders=[^&]*content-length/i);

    const csv = Buffer.from("a,b\n".repeat(256));
    const tooBig = Buffer.concat([csv, csv]);
    expect((await page.request.put(url, { data: tooBig })).status()).toBe(403);
    expect(
      (
        await page.request.put(url, { data: csv, headers: { "content-type": "text/html" } })
      ).status(),
    ).toBe(200);
    expect((await api(page, "POST", `/api/uploads/${versionId}/complete`)).status).toBe(200);
    expect(fx("object", versionId)).toMatchObject({ contentType: "application/octet-stream" });
  });

  test("2 unggahan berjalan → LIMIT_REACHED; kuota menghitung ukuran terdeklarasi UPLOADING", async ({
    page,
    browser,
    request,
  }) => {
    // Suite penuh mendaftarkan > 20 user dari satu IP (batas registrasi); test ini butuh 2 user baru.
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs"]);
    const email = uniqueEmail("up-limit");
    await createUser(browser, request, email);
    await apiLogin(page, email);
    const a = await createDataset(page, "Batas A");
    const b = await createDataset(page, "Batas B");
    const c = await createDataset(page, "Batas C");
    expect((await init(page, a, "a.xlsx", 10 * MiB)).status).toBe(200);
    expect((await init(page, b, "b.xlsx", 10 * MiB)).status).toBe(200);
    const third = await init(page, c, "c.xlsx", 10 * MiB);
    expect(third.status).toBe(409);
    expect(third.body.code).toBe("LIMIT_REACHED");

    // Kuota 20 GB: terpakai 18,6 GB (READY) + 1 GB UPLOADING terdeklarasi + 1 GB baru > 20 GB
    const q = uniqueEmail("up-quota");
    await createUser(browser, request, q);
    const ctx = await browser.newContext();
    const qp = await ctx.newPage();
    await apiLogin(qp, q);
    fx("usage", q, String(Math.round(18.6 * 1024 * MiB)));
    const d1 = await createDataset(qp, "Kuota Satu");
    const d2 = await createDataset(qp, "Kuota Dua");
    expect((await init(qp, d1, "satu.xlsx", MAX)).status).toBe(200);
    const over = await init(qp, d2, "dua.xlsx", MAX);
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("QUOTA_EXCEEDED");
    expect(String(over.body.message)).toContain("terpakai");
    await ctx.close();
  });

  test("hapus dataset saat unggahan berjalan → multipart di-abort; batal dari halaman menghapus unggahan", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    const id = await createDataset(page, "Hapus Saat Unggah");
    const r = await init(page, id, "berjalan.xlsx", 20 * MiB);
    const versionId = String(r.body.versionId);
    const uploadId = String(fx("version", versionId).uploadId);
    fx("put-part", versionId, "1", String(16 * MiB));
    const sourceKey = String(fx("version", versionId).sourceKey);
    expect(sourceKey).toBe(`raw/${id}/${versionId}/source.xlsx`);

    // Batal dari kartu "Unggahan belum selesai"
    const id2 = await createDataset(page, "Batal Unggah");
    const r2 = await init(page, id2, "batal.xlsx", 20 * MiB);
    await page.reload();
    await page.getByRole("button", { name: "Batalkan unggahan" }).click();
    await expect(page.getByTestId("upload-pending")).toHaveCount(0);
    expect(fx("latest", id2)).toEqual({ exists: false });
    expect(String(r2.body.versionId)).not.toBe("");

    // Hapus dataset pertama
    await page.goto(`/datasets/${id}`);
    await page.getByRole("button", { name: "Hapus dataset" }).click();
    await page.getByRole("dialog").getByLabel(/Ketik/).fill("hapus saat unggah");
    await page.getByRole("dialog").getByRole("button", { name: "Hapus permanen" }).click();
    await expect(page).toHaveURL(/\/datasets\?deleted=1/);
    // Versi ikut terhapus: complete → 404; multipart lama sudah di-abort (tidak menunggu lifecycle)
    expect((await api(page, "POST", `/api/uploads/${versionId}/complete`)).status).toBe(404);
    expect(fx("multipart-raw", sourceKey, uploadId)).toMatchObject({ alive: false });
  });
});
