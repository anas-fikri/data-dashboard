import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-021 video panduan: A = admin, B = pengguna biasa. Fixture dibuat ffmpeg saat uji:
 *   demo.mp4 — VP9 dalam wadah mp4 (ftyp; Chromium Playwright tanpa codec H.264), 6 menit, ±9 MB derau
 *              agar lompat ke menit 5 benar-benar meminta rentang di tengah file;
 *   fake.mp4 — .mkv yang diganti ekstensinya.
 *   AC1 unggah mp4 → durasi tersimpan, poster PNG di storage, video tampil;
 *   AC2 .mkv→.mp4 ditolak (pra-cek browser dan server setelah complete), > 500 MB ditolak saat init;
 *   AC5 poster bukan PNG → INVALID_FORMAT, > 2 MB → FILE_TOO_LARGE; non-admin → 404;
 *   AC3 /panduan: putar + lompat ke menit 5 → storage menjawab 206 untuk rentang di tengah file.
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("video-admin");
const B = uniqueEmail("video-user");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ARTICLE = `Video panduan ${TAG}`; // akhiran tag → dibersihkan dev-purge-test-data
const SLUG = `video-panduan-${TAG}`;
const DIR = join(tmpdir(), `guide-videos-${TAG}`);
const DEMO = join(DIR, "demo.mp4");
const FAKE = join(DIR, "fake.mp4");

let a: Page;
let b: Page;
let articleId = "";

const ff = (...args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

/** fetch dari halaman (Origin sama, cookie sesi) → { status, body }. */
function call(
  page: Page,
  path: string,
  init: { method: string; json?: unknown; bytes?: number[] },
) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init.method,
        headers: init.bytes
          ? { "content-type": "image/png" }
          : { "content-type": "application/json" },
        body: init.bytes ? new Uint8Array(init.bytes) : JSON.stringify(init.json ?? {}),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, init },
  );
}

test.describe("video panduan (T-021)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(180_000);
    mkdirSync(DIR, { recursive: true });
    ff(
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=320x180:r=1,geq=lum='random(1)*255':cb=128:cr=128",
      "-t",
      "360",
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-b:v",
      "240k",
      "-g",
      "5",
      "-pix_fmt",
      "yuv420p",
      DEMO,
    );
    ff(
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x36:r=1",
      "-t",
      "2",
      "-c:v",
      "libvpx",
      "-f",
      "matroska",
      FAKE,
    );
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    for (const email of [A, B]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-make-admin.mjs", A]);
    a = await pageFor(browser, A);
    b = await pageFor(browser, B);
    await a.goto("/admin/panduan/baru");
    await a.getByLabel("Judul").fill(ARTICLE);
    await a.getByLabel("Isi (markdown)").fill("Tonton video berikut.");
    await a.getByRole("button", { name: "Simpan sebagai draf" }).click();
    await expect(a).toHaveURL(/\/admin\/panduan\/[a-z0-9]{20,32}\?created=1$/);
    articleId = new URL(a.url()).pathname.split("/").pop()!;
  });

  test.afterAll(async () => {
    // Hapus artikel lewat UI → objek video/poster ikut dihapus service.
    if (a && articleId) {
      await a.goto("/admin/panduan");
      const row = a.getByTestId("guide-row").filter({ hasText: ARTICLE });
      if (await row.count()) {
        await row.getByRole("button", { name: `Hapus ${ARTICLE}` }).click();
        await a.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
        await expect(row).toHaveCount(0);
      }
    }
    await Promise.all([a, b].map((p) => p?.context().close()));
  });

  test("AC1: unggah mp4 → durasi tersimpan, poster PNG di storage, video tampil", async () => {
    test.setTimeout(120_000);
    await a.getByLabel("Judul video").fill("Mengunggah data");
    await a.getByTestId("video-input").setInputFiles(DEMO);
    await expect(a.getByText(/demo\.mp4 · 9 MB/)).toBeVisible();
    await a.getByRole("button", { name: "Unggah video" }).click();
    await expect(a.getByText("Video “Mengunggah data” tersimpan.")).toBeVisible({
      timeout: 90_000,
    });
    const fig = a.getByTestId("guide-video");
    await expect(fig).toHaveCount(1);
    await expect(fig).toContainText("Mengunggah data · 6:00");
    const poster = await fig.locator("video").getAttribute("poster");
    expect(poster).toMatch(/guides\/posters\/v[0-9a-f]{24}\.png/);
    const res = await a.request.get(poster!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect([...(await res.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("AC2: .mkv berganti .mp4 dan > 500 MB ditolak sebelum tersimpan", async () => {
    await a.getByLabel("Judul video").fill("Palsu");
    await a.getByTestId("video-input").setInputFiles(FAKE);
    await a.getByRole("button", { name: "Unggah video" }).click();
    await expect(a.getByText(/Isi file bukan video MP4/)).toBeVisible();
    await expect(a.getByRole("button", { name: /^Pilih video/ })).toBeFocused();

    const big = await call(a, "/api/guides/videos", {
      method: "POST",
      json: { articleId, title: "Besar", name: "besar.mp4", size: 500 * 1024 * 1024 + 1 },
    });
    expect(big).toMatchObject({ status: 413, body: { code: "FILE_TOO_LARGE" } });

    // Server: lolos pra-cek palsu → unggah part → complete membaca signature → INVALID_FORMAT, baris hilang.
    const fake = [...readFileSync(FAKE)];
    const verdict = await a.evaluate(
      async ({ articleId, fake }) => {
        const post = (path: string, body: unknown) =>
          fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }).then(async (r) => ({ status: r.status, body: await r.json() }));
        const init = await post("/api/guides/videos", {
          articleId,
          title: "Palsu server",
          name: "palsu.mp4",
          size: fake.length,
        });
        const id = init.body.videoId as string;
        const sign = await post(`/api/guides/videos/${id}/parts`, { partNumbers: [1] });
        const put = await fetch(sign.body.urls[0].url, {
          method: "PUT",
          body: new Uint8Array(fake),
        });
        const done = await post(`/api/guides/videos/${id}/complete`, { durationSec: 2 });
        const again = await post(`/api/guides/videos/${id}/parts`, { partNumbers: [1] });
        return { put: put.status, done, again: again.status };
      },
      { articleId, fake },
    );
    expect(verdict.put).toBe(200);
    expect(verdict.done).toMatchObject({ status: 422, body: { code: "INVALID_FORMAT" } });
    expect(verdict.again).toBe(404);
    await a.reload();
    await expect(a.getByTestId("guide-video")).toHaveCount(1);
  });

  test("AC5: poster bukan PNG / > 2 MB ditolak; non-admin 404", async () => {
    const id = await a.getByTestId("guide-video").getAttribute("data-video-id");
    const notPng = await call(a, `/api/guides/videos/${id}/poster`, {
      method: "POST",
      bytes: [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6],
    });
    expect(notPng).toMatchObject({ status: 422, body: { code: "INVALID_FORMAT" } });
    const huge = await a.evaluate(async (id) => {
      const body = new Uint8Array(2 * 1024 * 1024 + 1);
      body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const r = await fetch(`/api/guides/videos/${id}/poster`, {
        method: "POST",
        headers: { "content-type": "image/png" },
        body,
      });
      return { status: r.status, body: await r.json() };
    }, id);
    expect(huge).toMatchObject({ status: 413, body: { code: "FILE_TOO_LARGE" } });

    await b.goto("/panduan");
    for (const [path, json] of [
      ["/api/guides/videos", { articleId, title: "x", name: "x.mp4", size: 10 }],
      [`/api/guides/videos/${id}/parts`, { partNumbers: [1] }],
      [`/api/guides/videos/${id}/complete`, {}],
    ] as const) {
      expect((await call(b, path, { method: "POST", json })).status, path).toBe(404);
    }
    expect((await call(b, `/api/guides/videos/${id}`, { method: "DELETE" })).status).toBe(404);
  });

  test("AC3: di /panduan, putar lalu lompat ke menit 5 → 206 untuk rentang tengah file", async () => {
    await a.goto("/admin/panduan");
    const row = a.getByTestId("guide-row").filter({ hasText: ARTICLE });
    await row.getByRole("button", { name: /^Terbitkan/ }).click();
    await expect(row.getByRole("button", { name: /^Tarik/ })).toBeVisible();

    const ranges: { status: number; start: number }[] = [];
    b.on("response", async (res) => {
      if (!res.url().includes("/guides/videos/")) return;
      const range = (await res.request().allHeaders())["range"] ?? "";
      ranges.push({ status: res.status(), start: Number(/bytes=(\d+)-/.exec(range)?.[1] ?? -1) });
    });
    await b.goto(`/panduan/${SLUG}`);
    const video = b.getByTestId("guide-video").locator("video");
    await video.evaluate(async (v: HTMLVideoElement) => {
      v.muted = true;
      await v.play();
    });
    // Hanya permintaan karena lompatan: rentang di tengah file (bukan awal, bukan indeks moov di akhir).
    const before = ranges.length;
    await video.evaluate(
      (v: HTMLVideoElement) =>
        new Promise<void>((resolve) => {
          v.addEventListener("seeked", () => resolve(), { once: true });
          v.currentTime = 300;
        }),
    );
    const size = statSync(DEMO).size;
    await expect
      .poll(() =>
        ranges
          .slice(before)
          .some(
            (r) => r.status === 206 && r.start > 4 * 1024 * 1024 && r.start < size - 512 * 1024,
          ),
      )
      .toBe(true);
    expect(ranges.every((r) => r.status === 206)).toBe(true);
  });

  test("T-z5nq AC2: halaman terbuka > 1 jam → lompat memakai sumber baru tanpa muat ulang", async () => {
    await b.clock.install();
    await b.goto(`/panduan/${SLUG}`);
    const video = b.getByTestId("guide-video").locator("video");
    const oldSrc = await video.getAttribute("src");
    // Nilai awal tercatat saat pemutar terpasang; jam dimajukan melewati umur presigned (1 jam).
    await b.waitForTimeout(500);
    await b.clock.fastForward("01:01:00");
    const fresh = b.waitForResponse((r) => r.url().includes("/sumber") && r.status() === 200);
    await video.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      v.currentTime = 120;
    });
    await fresh;
    await expect(video).not.toHaveAttribute("src", oldSrc!);
    // Tanpa muat ulang: navigasi tetap di artikel yang sama, posisi dipulihkan setelah metadata baru.
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime)))
      .toBe(120);
  });

  test("T-j9j6: takarir .vtt → tombol takarir di /panduan dan teks sinkron; tidak sah / > 200 KB ditolak", async () => {
    await a.goto(`/admin/panduan/${articleId}`);
    const item = a.getByRole("list", { name: "Video artikel ini" }).getByRole("listitem").first();
    const videoId = (await item.getByTestId("guide-video").getAttribute("data-video-id"))!;
    const input = item.getByTestId("caption-input");
    const status = item.getByTestId("caption-status");
    const file = (name: string, text: string) => ({
      name,
      mimeType: "text/vtt",
      buffer: Buffer.from(text),
    });

    // AC2: isi bukan WebVTT (SRT berekstensi .vtt) → INVALID_FORMAT dari server; > 200 KB → FILE_TOO_LARGE.
    await input.setInputFiles(file("salah.vtt", "1\n00:00:00,000 --> 00:00:02,000\nHalo\n"));
    await expect(status).toHaveText(/Takarir harus file WebVTT/);
    const big = await call(a, `/api/guides/videos/${videoId}/takarir`, {
      method: "POST",
      bytes: [...Buffer.from("WEBVTT\n"), ...new Array(200 * 1024).fill(0x41)],
    });
    expect(big).toMatchObject({ status: 413, body: { code: "FILE_TOO_LARGE" } });
    const notAdmin = await call(b, `/api/guides/videos/${videoId}/takarir`, {
      method: "POST",
      bytes: [...Buffer.from("WEBVTT\n")],
    });
    expect(notAdmin.status).toBe(404);
    await expect(item.getByRole("button", { name: /^Tambah takarir/ })).toBeVisible();

    // AC1: WebVTT sah → tersimpan; tombol berganti "Ganti takarir" setelah halaman disegarkan.
    const vtt = (second: string) =>
      `WEBVTT\n\n00:00.000 --> 00:04.000\nKlik Tambah dataset\n\n00:04.000 --> 00:08.000\n${second}\n`;
    await input.setInputFiles(file("narasi.vtt", vtt("Pilih file Exel")));
    await expect(status).toHaveText(/^Takarir video .* tersimpan\.$/);
    await expect(item.getByRole("button", { name: /^Ganti takarir/ })).toBeVisible();
    // Ganti takarir (salah ketik diperbaiki): URL <track> pratinjau berganti versi tanpa muat ulang.
    const track = item.locator("track");
    const first = await track.getAttribute("src");
    await input.setInputFiles(file("narasi.vtt", vtt("Pilih file Excel")));
    await expect(track).not.toHaveAttribute("src", first!);

    // Pembaca: <track> same-origin (text/vtt, nosniff, tidak disimpan cache bersama), cue aktif sinkron.
    await b.goto(`/panduan/${SLUG}`);
    const video = b.getByTestId("guide-video").locator("video");
    await expect(video.locator("track")).toHaveAttribute("srclang", "id");
    const served = await b.evaluate(async (id) => {
      const r = await fetch(`/api/guides/videos/${id}/takarir`);
      const h = (k: string) => r.headers.get(k);
      return {
        status: r.status,
        type: h("content-type"),
        sniff: h("x-content-type-options"),
        cache: h("cache-control"),
        text: await r.text(),
      };
    }, videoId);
    expect(served).toMatchObject({
      status: 200,
      type: "text/vtt; charset=utf-8",
      sniff: "nosniff",
      cache: "private, no-cache",
    });
    expect(served.text.startsWith("WEBVTT")).toBe(true);
    await video.evaluate((v: HTMLVideoElement) => {
      v.textTracks[0]!.mode = "showing";
      v.currentTime = 5;
    });
    await expect
      .poll(() =>
        video.evaluate((v: HTMLVideoElement) => {
          const cues = v.textTracks[0]!.activeCues;
          return cues?.length ? (cues[0] as VTTCue).text : null;
        }),
      )
      .toBe("Pilih file Excel");
  });

  test("T-qqbc: hapus takarir lewat dialog → tombol takarir hilang di pemutar, sumbernya 404", async () => {
    await a.goto(`/admin/panduan/${articleId}`);
    const item = a.getByRole("list", { name: "Video artikel ini" }).getByRole("listitem").first();
    const videoId = (await item.getByTestId("guide-video").getAttribute("data-video-id"))!;
    await expect(item.locator("track")).toHaveCount(1);
    // Batal → fokus kembali ke tombol pembuka (masih ada).
    const opener = item.getByRole("button", { name: /^Hapus takarir/ });
    await opener.click();
    await a.getByRole("alertdialog").getByRole("button", { name: "Batal" }).click();
    await expect(opener).toBeFocused();
    await opener.click();
    const dialog = a.getByRole("alertdialog");
    await expect(dialog).toContainText("Hapus takarir?");
    await dialog.getByRole("button", { name: "Hapus" }).click();
    await expect(item.getByTestId("caption-status")).toHaveText(/^Takarir video .* dihapus\.$/);
    await expect(item.locator("track")).toHaveCount(0);
    // Fokus kembali ke tombol tambah (tombol hapus sudah hilang).
    await expect(item.getByRole("button", { name: /^Tambah takarir/ })).toBeFocused();
    await expect(item.getByRole("button", { name: /^Hapus takarir/ })).toHaveCount(0);
    const gone = await b.evaluate(
      async (id) => (await fetch(`/api/guides/videos/${id}/takarir`)).status,
      videoId,
    );
    expect(gone).toBe(404);
  });

  test("review AC4: progres diumumkan; selesai tidak merebut fokus; hapus berturut-turut fokus ke pesan", async () => {
    test.setTimeout(120_000);
    await a.goto(`/admin/panduan/${articleId}`);
    // F1: 5 unggahan yang ditinggal (init tanpa part) tidak menghabiskan batas 5 video.
    for (let i = 0; i < 5; i++) {
      const r = await call(a, "/api/guides/videos", {
        method: "POST",
        json: { articleId, title: `Ditinggal ${i}`, name: "x.mp4", size: 1000 },
      });
      expect(r.status).toBe(200);
    }
    // Tahan complete agar unggahan masih berjalan saat admin mengetik di kolom lain.
    await a.route("**/api/guides/videos/*/complete", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await a.evaluate(() => {
      const el = document.querySelector(
        'form[aria-labelledby="video-upload-title"] p[role="status"]',
      )!;
      const seen: string[] = ((window as { __vs?: string[] }).__vs = []);
      new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    await a.getByLabel("Judul video").fill("Video kedua");
    await a.getByTestId("video-input").setInputFiles(DEMO);
    await a.getByRole("button", { name: "Unggah video" }).click();
    await expect(a.getByRole("button", { name: "Batalkan" })).toBeFocused();
    const body = a.getByLabel("Isi (markdown)");
    await body.click();
    await body.press("End");
    await a.keyboard.type(" lanjut");
    // Terakhir di DOM = FormAlert yang terlihat (salinan pertama ada di wilayah status sr-only).
    await expect(a.getByText("Video “Video kedua” tersimpan.").last()).toBeVisible({
      timeout: 60_000,
    });
    await expect(body).toBeFocused();
    await expect(body).toHaveValue(/ lanjut$/);
    const seen = await a.evaluate(() => (window as { __vs?: string[] }).__vs ?? []);
    expect(
      seen.some((t) => /Mengunggah \d+%|Memeriksa video di server/.test(t)),
      seen.join("|"),
    ).toBe(true);
    // T-z5nq: fokus di kolom lain → pesan akhir tetap diumumkan lewat wilayah status.
    expect(
      seen.some((t) => t.includes("Video “Video kedua” tersimpan.")),
      seen.join("|"),
    ).toBe(true);
    await a.unroute("**/api/guides/videos/*/complete");

    await a.reload();
    // T-z5nq AC3: kolom grid mengikuti lebar kontainer, bukan viewport (editor punya sidebar).
    const columns = async () =>
      new Set(
        await a
          .getByTestId("guide-video")
          .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x))),
      ).size;
    const section = a.locator('section[aria-labelledby="guide-videos-title"]');
    for (const width of [800, 1024, 1280, 1440]) {
      await a.setViewportSize({ width, height: 1000 });
      const w = await section.evaluate((e) => e.getBoundingClientRect().width);
      // Dua kolom tepat bila kontainer ≥ 38rem (608 px), berapa pun lebar viewport-nya.
      await expect
        .poll(columns, `${width} px, kontainer ${Math.round(w)} px`)
        .toBe(w >= 608 ? 2 : 1);
    }
    let previous: string | null = null;
    for (const title of ["Video kedua", "Mengunggah data"]) {
      await a.getByRole("button", { name: `Hapus video ${title}` }).click();
      // Aksi berikutnya dimulai: pesan hasil lama hilang.
      if (previous) await expect(a.getByText(`Video “${previous}” dihapus.`)).toHaveCount(0);
      previous = title;
      await a.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
      await expect(
        a.getByRole("status").filter({ hasText: `Video “${title}” dihapus.` }),
      ).toBeFocused();
    }
    await expect(a.getByTestId("guide-video")).toHaveCount(0);
  });
});
