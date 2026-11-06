/*
 * Dev saja (T-xfzy, T-3k08): rekam video panduan per peran dengan Playwright terhadap app yang berjalan,
 * lalu tulis manifest untuk seed-guides.ts. Video = webm 1280×720 bernarasi suara bahasa Indonesia:
 * naskah di scripts/guide-narration.json, audio dibuat dulu oleh scripts/guide-tts.mjs, dan setiap
 * langkah (s.step) menunggu kalimatnya selesai diucapkan — tempo video mengikuti suara. Takarir singkat
 * tampil di layar, takarir lengkap (.vtt) dari naskah, titik biru mengikuti kursor. Akun dan data demo
 * fiktif (tanpa data pribadi).
 *   node scripts/with-demo-env.mjs npx tsx --env-file-if-exists=.env scripts/record-guide-videos.ts \
 *     [--only adegan1,adegan2] [--silent]   (--silent: tanpa audio, durasi kalimat diperkirakan)
 * Butuh: dev server + worker yang juga dijalankan lewat with-demo-env.mjs (DB demo bersih, tanpa user
 * nyata) dan isi panduan sudah di-seed ke DB demo. Keluaran: demo/guide-videos/*.webm +
 * videos.json, lalu: npx tsx --conditions=react-server --env-file-if-exists=.env scripts/seed-guides.ts
 *   --videos demo/guide-videos
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { AUDIO_DIR, audioName, captionText } from "./guide-audio.mjs";
import { assemble, toVtt } from "./guide-assemble.mjs";

if (process.env.NODE_ENV === "production") throw new Error("ditolak: NODE_ENV=production");
// DB dev bersama berisi user nyata dan fixture uji yang tidak boleh ikut terekam (review T-xfzy F1/F2).
if (process.env.DEMO_ENV !== "1")
  throw new Error(
    "jalankan lewat scripts/with-demo-env.mjs (DB demo bersih), lihat komentar di atas",
  );
const BASE = process.env.APP_URL ?? "http://localhost:3100";
const OUT = join(process.cwd(), "demo/guide-videos");
const DATA = join(OUT, "pengiriman-cabang-2026.csv");
const DATASET = "Pengiriman cabang 2026";
const DASHBOARD = "Kinerja pengiriman";
const PIVOT = "Paket per cabang per bulan";
const SAVED_PIVOT = "Omzet per paket per cabang";
const SAVED_CHART = "Omzet per paket per cabang";
const SAVED_KPI = "Omzet per paket (semua cabang)";
const SAVED_TABLE = "Tabel omzet per paket";
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i > 0 ? new Set(process.argv[i + 1]!.split(",")) : null;
})();

const ACCOUNTS = {
  owner: { email: "demo.pemilik@pcpexpress.com", name: "Budi Santoso", admin: false },
  editor: { email: "demo.editor@pcpexpress.com", name: "Sari Wulandari", admin: false },
  viewer: { email: "demo.viewer@pcpexpress.com", name: "Andi Pratama", admin: false },
  admin: { email: "demo.admin@pcpexpress.com", name: "Dewi Lestari", admin: true },
} as const;
type Who = keyof typeof ACCOUNTS;
const passwords = {} as Record<Who, string>;
const prisma = new PrismaClient();
/** Data demo selalu dicari lewat pemiliknya (nama dashboard/dataset bisa dipakai user lain). */
const demoOwned = { owner: { email: "demo.pemilik@pcpexpress.com" } } as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Line = { caption: string; voice: string };
type Cue = { t: number; dur: number; text: string; file: string | null };
const NARRATION = JSON.parse(readFileSync("scripts/guide-narration.json", "utf8")) as {
  voice: Record<string, unknown>;
  scenes: Record<string, Line[]>;
};
const SILENT = process.argv.includes("--silent");
const audioSec = (file: string) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ])
      .toString()
      .trim(),
  );

/** Data demo deterministik: 1.200 baris pengiriman Jan–Jun 2026, 6 cabang, 3 layanan. */
function writeDemoCsv() {
  const cabang = ["Jakarta", "Bandung", "Surabaya", "Medan", "Makassar", "Semarang"];
  const layanan = [
    ["Reguler", 18_000],
    ["Kilat", 32_000],
    ["Kargo", 95_000],
  ] as const;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = ["Tanggal kirim,Cabang,Layanan,Jumlah paket,Omzet"];
  for (let i = 0; i < 1200; i++) {
    const day = new Date(Date.UTC(2026, 0, 1) + Math.floor(rnd() * 181) * 86_400_000);
    const c = cabang[Math.floor(rnd() * cabang.length)]!;
    const [l, price] = layanan[Math.floor(rnd() * layanan.length)]!;
    const n = 5 + Math.floor(rnd() * 120 * (c === "Jakarta" ? 2 : 1));
    lines.push(`${day.toISOString().slice(0, 10)},${c},${l},${n},${n * price}`);
  }
  writeFileSync(DATA, `${lines.join("\n")}\n`);
}

/** Akun demo terverifikasi (password acak baru, tidak dicetak) + nama tampilan. */
async function ensureAccounts() {
  for (const who of Object.keys(ACCOUNTS) as Who[]) {
    const a = ACCOUNTS[who];
    const out = execFileSync("npx", [
      ...["tsx", "--conditions=react-server", "--env-file-if-exists=.env"],
      ...["scripts/dev-create-user.ts", a.email, ...(a.admin ? ["--admin"] : [])],
    ]).toString();
    passwords[who] = JSON.parse(out.trim().split("\n").pop()!).password;
    await prisma.user.update({ where: { email: a.email }, data: { name: a.name } });
  }
}

/** Hapus dataset demo lama (dan objek storage-nya) agar rekaman bisa diulang. */
async function resetDemoData() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.owner.email } });
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
  for (const d of await prisma.dataset.findMany({ where: { ownerId: owner.id } })) {
    for (const prefix of [`raw/${d.id}/`, `parquet/${d.id}/`]) {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length)
        await s3.send(
          new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET, Delete: { Objects: keys } }),
        );
    }
    await prisma.dataset.delete({ where: { id: d.id } });
  }
}

/**
 * Takarir + titik kursor di setiap halaman. Hidrasi React bisa membuang node asing, jadi dipasang ulang
 * berkala (idempoten per id); teks takarir disimpan di window. String JS murni: fungsi TS yang
 * ditranspilasi tsx membawa helper __name yang tidak ada di browser.
 */
const OVERLAY = `(() => {
  let x = -60, y = -60;
  const css = "#__demo-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(88vw,980px);background:rgba(15,23,42,.92);color:#fff;font:600 21px/1.45 system-ui,sans-serif;padding:12px 22px;border-radius:10px;z-index:2147483647;pointer-events:none;text-align:center;transition:opacity .25s}#__demo-cur{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:rgba(37,99,235,.28);border:2px solid rgba(37,99,235,.95);z-index:2147483647;pointer-events:none;transition:transform .12s,background .12s}#__demo-cur.down{transform:scale(.65);background:rgba(37,99,235,.65)}";
  const cur = () => document.getElementById("__demo-cur");
  addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; const c = cur(); if (c) { c.style.left = x + "px"; c.style.top = y + "px"; } }, true);
  addEventListener("mousedown", () => cur()?.classList.add("down"), true);
  addEventListener("mouseup", () => cur()?.classList.remove("down"), true);
  window.__cap = (t) => {
    window.__capText = t;
    const cap = document.getElementById("__demo-cap");
    if (cap) { cap.textContent = t; cap.style.opacity = t ? "1" : "0"; }
  };
  const install = () => {
    if (!document.body || document.getElementById("__demo-cap")) return;
    document.getElementById("__demo-style")?.remove();
    const style = document.createElement("style");
    style.id = "__demo-style";
    style.textContent = css;
    const cap = document.createElement("div");
    cap.id = "__demo-cap";
    cap.style.opacity = "0";
    const c = document.createElement("div");
    c.id = "__demo-cur";
    c.style.left = x + "px";
    c.style.top = y + "px";
    document.body.append(style, cap, c);
    window.__cap(window.__capText || "");
  };
  setInterval(install, 200);
})();`;

class Scene {
  caption = "";
  readonly timeline: Cue[] = [];
  private next = 0;
  private readonly t0 = Date.now();
  constructor(
    readonly page: Page,
    readonly lines: Line[],
  ) {
    page.on("load", () => void this.apply());
  }
  private apply() {
    return this.page
      .evaluate(`window.__cap && window.__cap(${JSON.stringify(this.caption)})`)
      .catch(() => {});
  }
  /**
   * Langkah berikutnya di naskah: takarir layar tampil, kalimat narasi diucapkan mulai detik ini, dan
   * langkah menunggu sampai kalimat selesai (+ jeda napas) atau minimal `minMs`.
   */
  async step(minMs = 600) {
    await this.speak();
    await this.idle(minMs);
  }
  /** Seperti step, tetapi aksi berikutnya berjalan selagi kalimat diucapkan (tanpa jeda hening). */
  async talk() {
    await this.speak();
  }
  /** Tunggu kalimat yang sedang diucapkan selesai (+ jeda napas), minimal `minMs`. */
  async idle(minMs = 0) {
    await wait(Math.max(minMs, this.busyUntil - Date.now()));
  }
  private busyUntil = 0;
  private async speak() {
    // Dua kalimat tidak pernah tumpang-tindih: kalimat baru menunggu yang sebelumnya selesai.
    await this.idle();
    const line = this.lines[this.next++];
    if (!line)
      throw new Error(
        `naskah habis di langkah ${this.next} — tambah kalimat di guide-narration.json`,
      );
    this.caption = line.caption;
    await this.apply();
    const file = join(AUDIO_DIR, audioName(NARRATION.voice, line.voice));
    const voiced = existsSync(file);
    if (!voiced && !SILENT)
      throw new Error(`audio belum ada untuk "${line.voice}" — jalankan scripts/guide-tts.mjs`);
    // Tanpa audio: perkiraan ± 2,6 kata per detik (tempo narasi santai).
    const dur = voiced ? audioSec(file) : captionText(line.voice).split(/\s+/).length / 2.6;
    this.timeline.push({
      t: Date.now() - this.t0,
      dur,
      text: captionText(line.voice),
      file: voiced ? file : null,
    });
    this.busyUntil = Date.now() + dur * 1000 + 450;
  }
  /** Semua kalimat naskah adegan ini sudah dipakai (urutan naskah = urutan langkah). */
  done() {
    if (this.next !== this.lines.length)
      throw new Error(`naskah ${this.lines.length} kalimat, terpakai ${this.next}`);
  }
  async clear(ms: number) {
    await this.idle();
    this.caption = "";
    await this.apply();
    await wait(ms);
  }
  /** Gerakkan kursor ke elemen (terlihat di video), lalu klik. */
  async click(target: Locator, pause = 700) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box)
      await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
    await wait(250);
    await target.click();
    await wait(pause);
  }
  async type(target: Locator, text: string) {
    await this.click(target, 200);
    await target.pressSequentially(text, { delay: 55 });
    await wait(500);
  }
  async choose(label: Locator, option: string) {
    await this.click(label, 400);
    // Awalan nama: opsi kolom bisa membawa keterangan (mis. tipe) setelah namanya.
    const re = new RegExp(`^${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    await this.click(this.page.getByRole("option", { name: re }).first(), 600);
  }
}

async function login(browser: Browser, who: Who): Promise<string> {
  const file = join(OUT, `.state-${who}.json`);
  const ctx = await browser.newContext({ baseURL: BASE });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("Email perusahaan").fill(ACCOUNTS[who].email);
  await p.locator("input[name=password]").fill(passwords[who]);
  await p.getByRole("button", { name: "Masuk" }).click();
  await p.waitForURL((u) => new URL(u).pathname === "/");
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

type SceneFn = (s: Scene) => Promise<void>;
const manifest: { slug: string; file: string; title: string; captions: string }[] = [];

async function record(
  browser: Browser,
  name: string,
  meta: { slug: string; title: string },
  who: Who | null,
  fn: SceneFn,
) {
  if (ONLY && !ONLY.has(name)) return;
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: join(OUT, ".raw"), size: { width: 1280, height: 720 } },
    locale: "id-ID",
    colorScheme: "light",
    ...(who ? { storageState: await login(browser, who) } : {}),
  });
  await ctx.addInitScript({ content: OVERLAY });
  const lines = NARRATION.scenes[name];
  if (!lines) throw new Error(`adegan ${name} tidak ada di guide-narration.json`);
  const page = await ctx.newPage();
  const scene = new Scene(page, lines);
  try {
    await fn(scene);
    scene.done();
    await scene.clear(900);
  } finally {
    const video = page.video();
    await ctx.close();
    // Linimasa diukur dari halaman dibuat (= awal rekaman); audio ditempatkan pada detik yang sama.
    if (video) assemble(await video.path(), join(OUT, `${name}.webm`), scene.timeline);
  }
  writeFileSync(join(OUT, `${name}.vtt`), toVtt(scene.timeline));
  manifest.push({
    slug: meta.slug,
    file: `${name}.webm`,
    title: meta.title,
    captions: `${name}.vtt`,
  });
  console.log(`terekam: ${name} (${scene.timeline.filter((c) => c.file).length} kalimat bersuara)`);
}

const sidebar = (p: Page, label: string) =>
  p.getByTestId("sidebar").getByRole("link", { name: label, exact: true });
const widgetTitled = (p: Page, title: string) =>
  p.getByTestId("widget").filter({ has: p.getByRole("heading", { name: title }) });

async function addWidget(s: Scene, title: string, type: string) {
  const p = s.page;
  await s.click(
    p.getByTestId("canvas-toolbar").getByRole("button", { name: "Tambah widget", exact: true }),
  );
  const panel = p.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeVisible();
  const judul = panel.getByLabel("Judul", { exact: true });
  await judul.fill("");
  await s.type(judul, title);
  await judul.press("Enter");
  await s.click(panel.getByText(type, { exact: true }));
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  return panel;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(join(OUT, ".raw"), { recursive: true, force: true });
  writeDemoCsv();
  await ensureAccounts();
  if (!ONLY || ONLY.has("pemilik-unggah")) await resetDemoData();
  const browser = await chromium.launch();
  try {
    await record(
      browser,
      "pemilik-unggah",
      { slug: "unggah-data", title: "Membuat dataset dan mengunggah file" },
      "owner",
      async (s) => {
        const p = s.page;
        await p.goto("/datasets");
        await s.step();
        await s.click(p.getByRole("link", { name: "Buat dataset" }).first(), 600);
        await s.step(600);
        await s.type(p.getByLabel("Nama dataset"), DATASET);
        await s.click(p.getByRole("button", { name: "Buat dataset" }), 300);
        await s.step(2400);
        await s.page.hover('[data-testid="upload-dropzone"] button');
        await wait(600);
        await p.getByTestId("upload-input").setInputFiles(DATA);
        await s.step(1500);
        await expect(p.getByTestId("dataset-active")).toBeVisible({ timeout: 120_000 });
        await s.step(3000);
        await s.click(p.getByTestId("dataset-schema-link"), 1500);
        await s.step(3000);
      },
    );

    await record(
      browser,
      "pemilik-skema",
      { slug: "periksa-skema", title: "Memeriksa dan memperbaiki skema" },
      "owner",
      async (s) => {
        const p = s.page;
        const d = await prisma.dataset.findFirstOrThrow({ where: { name: DATASET, ...demoOwned } });
        await p.goto(`/datasets/${d.id}/skema`);
        await s.step(3200);
        // Nama kolom ada di nilai <input> (bukan teks): kolom ke-5 file demo = Omzet.
        const col = p.getByTestId("schema-column").nth(4);
        await expect(col.getByLabel("Nama kolom")).toHaveValue("Omzet");
        await col.scrollIntoViewIfNeeded();
        await s.step(1200);
        const nama = col.getByLabel("Nama kolom");
        await nama.fill("");
        await s.type(nama, "Omzet (Rp)");
        await s.step(2600);
        await s.step(1200);
        await s.click(
          p.getByTestId("schema-save-bar").getByRole("button", { name: "Simpan perubahan" }),
          1500,
        );
        await expect(p.getByTestId("recast-done")).toBeVisible({ timeout: 120_000 });
        await s.step(1500);
        await p.getByRole("heading", { name: "Contoh data" }).scrollIntoViewIfNeeded();
        await wait(2500);
      },
    );

    await record(
      browser,
      "pemilik-dashboard",
      { slug: "susun-dashboard", title: "Menyusun dashboard pertama" },
      "owner",
      async (s) => {
        const p = s.page;
        // rekaman bisa diulang
        await prisma.dashboard.deleteMany({ where: { name: DASHBOARD, dataset: demoOwned } });
        await p.goto("/dashboards");
        await s.talk();
        await s.click(p.getByRole("link", { name: "Buat dashboard" }).first(), 1200);
        await s.talk();
        // Opsi berlabel "<nama> (n/maks dashboard)".
        await s.click(p.getByLabel("Dataset"), 400);
        await s.click(p.getByRole("option", { name: new RegExp(`^${DATASET}`) }), 600);
        await s.type(p.getByLabel("Nama dashboard"), DASHBOARD);
        await s.click(p.getByRole("button", { name: "Buat dashboard" }), 1800);
        await s.talk();
        let panel = await addWidget(s, "Total omzet", "Angka");
        await s.talk();
        await s.choose(panel.getByLabel("Nilai", { exact: true }), "Total");
        await s.talk();
        await s.choose(panel.getByLabel("dari kolom", { exact: true }), "Omzet (Rp)");
        await s.choose(panel.getByLabel("Format angka", { exact: true }), "Rupiah (Rp 1.234)");
        await s.idle(1500);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.talk();
        panel = await addWidget(s, "Paket per cabang", "Batang");
        await s.talk();
        await s.choose(panel.getByLabel("Nilai", { exact: true }), "Total");
        await s.choose(panel.getByLabel("dari kolom", { exact: true }), "Jumlah paket");
        await s.idle(1500);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.talk();
        panel = await addWidget(s, "Omzet per bulan", "Garis");
        await s.talk();
        await s.choose(panel.getByLabel("Kelompokkan menurut", { exact: true }), "Tanggal kirim");
        await s.choose(panel.getByLabel("Rentang waktu", { exact: true }), "Per bulan");
        await s.choose(panel.getByLabel("dari kolom", { exact: true }), "Omzet (Rp)");
        await s.idle(800);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.talk();
        const filters = p.getByTestId("dashboard-filter-columns");
        await s.click(filters.getByRole("button", { name: "Tambah kolom filter" }), 600);
        await s.click(p.getByRole("menuitem", { name: /^Cabang/ }), 1200);
        await s.talk();
        await s.click(
          p.getByTestId("canvas-toolbar").getByRole("button", { name: "Selesai" }),
          1500,
        );
        // Adegan ditutup setelah isi widget tampil (bukan kerangka memuat).
        await expect(
          widgetTitled(p, "Total omzet")
            .getByText(/Rp\s?[\d.,]+/)
            .first(),
        ).toBeVisible({
          timeout: 60_000,
        });
        await s.idle(2500);
      },
    );

    await record(
      browser,
      "pemilik-pivot",
      { slug: "widget-pivot", title: "Tabel pivot seperti di Excel" },
      "owner",
      async (s) => {
        const p = s.page;
        const dash = await prisma.dashboard.findFirstOrThrow({
          where: { name: DASHBOARD, dataset: demoOwned },
        });
        // Rekaman bisa diulang: widget pivot lama dan item tata letaknya dibuang.
        const old = await prisma.widget.findMany({ where: { dashboardId: dash.id, title: PIVOT } });
        if (old.length) {
          const gone = new Set(old.map((w) => w.id));
          await prisma.$transaction([
            prisma.widget.deleteMany({ where: { id: { in: [...gone] } } }),
            prisma.dashboard.update({
              where: { id: dash.id },
              data: {
                layout: (dash.layout as { i: string }[]).filter((it) => !gone.has(it.i)),
                layoutRevision: { increment: 1 },
              },
            }),
          ]);
        }
        await p.goto(`/dashboards/${dash.id}?mode=edit`);
        await s.talk();
        const panel = await addWidget(s, PIVOT, "Pivot");
        await expect(panel.getByTestId("pivot-summary")).toBeVisible();
        await s.step(1200);
        await panel.getByTestId("pivot-row-0").scrollIntoViewIfNeeded();
        await s.step(800);
        await s.talk();
        await s.click(panel.getByRole("button", { name: "Rinci baris (mis. per layanan)" }), 1200);
        await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
        await s.idle(600);
        await panel.getByTestId("pivot-column").scrollIntoViewIfNeeded();
        await s.step(800);
        await panel.getByText("Nilai 1", { exact: true }).scrollIntoViewIfNeeded();
        await s.step(800);
        await s.talk();
        // Lebar penuh (12 kolom): 6 bulan + kolom Total muat tanpa digeser.
        for (let i = 0; i < 8; i++)
          await s.click(panel.getByRole("button", { name: `Perlebar ${PIVOT}` }), 300);
        for (let i = 0; i < 2; i++)
          await s.click(panel.getByRole("button", { name: `Pertinggi ${PIVOT}` }), 300);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.click(
          p.getByTestId("canvas-toolbar").getByRole("button", { name: "Selesai" }),
          1500,
        );
        const w = widgetTitled(p, PIVOT);
        await expect(w.getByTestId("widget-pivot")).toBeVisible({ timeout: 60_000 });
        // Kartu di atas layar (di bawah kepala aplikasi), tidak tertutup takarir di bawah.
        await w.evaluate((el) => {
          el.scrollIntoView({ block: "start" });
          window.scrollBy(0, -72);
        });
        await wait(600);
        await s.talk();
        await w.getByRole("region").hover();
        for (let i = 0; i < 3; i++) {
          await p.mouse.wheel(0, 260);
          await wait(900);
        }
        await s.idle(800);
        await s.talk();
        await s.click(w.getByTestId("widget-export"), 900);
        await s.click(p.getByTestId("export-xlsx"), 600);
        await expect(p.getByTestId("export-download").first()).toBeVisible({ timeout: 60_000 });
        await s.step(2000);
        await p.keyboard.press("Escape");
      },
    );

    await record(
      browser,
      "pemilik-pivot-tersimpan",
      { slug: "satu-pivot-banyak-widget", title: "Pivot tersimpan dan field terhitung" },
      "owner",
      async (s) => {
        const p = s.page;
        const d = await prisma.dataset.findFirstOrThrow({ where: { name: DATASET, ...demoOwned } });
        const dash = await prisma.dashboard.findFirstOrThrow({
          where: { name: DASHBOARD, dataset: demoOwned },
        });
        // Rekaman bisa diulang: widget adegan ini, item tata letaknya, dan pivot tersimpannya dibuang.
        const old = await prisma.widget.findMany({
          where: { dashboardId: dash.id, title: { in: [SAVED_CHART, SAVED_KPI, SAVED_TABLE] } },
        });
        const gone = new Set(old.map((w) => w.id));
        await prisma.$transaction([
          prisma.widget.deleteMany({ where: { id: { in: [...gone] } } }),
          prisma.dashboard.update({
            where: { id: dash.id },
            data: {
              layout: (dash.layout as { i: string }[]).filter((it) => !gone.has(it.i)),
              layoutRevision: { increment: 1 },
            },
          }),
          prisma.savedPivot.deleteMany({ where: { datasetId: d.id, name: SAVED_PIVOT } }),
        ]);
        const opButton = (scope: Locator, symbol: string) =>
          scope
            .getByTestId("calc-operators")
            .getByRole("button", { name: new RegExp(`^\\${symbol} `) });
        const addMeasure = async (editor: Locator, column: string) => {
          await s.choose(editor.getByLabel("Ukuran", { exact: true }), "Total");
          await s.choose(editor.getByLabel("dari kolom", { exact: true }), column);
          await s.click(editor.getByTestId("calc-add-measure"), 700);
        };

        // Opsi nilai widget terikat berlabel "Nilai <n>: <nama>": pilih field terhitung lewat namanya.
        const pickCalc = async (panel: Locator) => {
          await s.click(panel.getByLabel("Nilai", { exact: true }), 400);
          await s.click(p.getByRole("option", { name: /: Omzet per paket$/ }), 600);
        };

        // 1. Buat pivot tersimpan + field terhitung di halaman dataset.
        await p.goto(`/datasets/${d.id}`);
        const card = p.getByTestId("saved-pivot-card");
        await card.scrollIntoViewIfNeeded();
        await s.talk();
        await s.talk();
        await s.click(card.getByTestId("saved-pivot-new"), 1200);
        await s.type(p.getByRole("textbox", { name: "Nama", exact: true }), SAVED_PIVOT);
        const editorPage = p.getByTestId("saved-pivot-editor");
        const summary = editorPage.getByTestId("pivot-summary");
        await summary.scrollIntoViewIfNeeded();
        await s.step(1500);
        await s.talk();
        await s.click(editorPage.getByTestId("calc-add"), 900);
        const calc = editorPage.getByTestId("calc-editor");
        await s.talk();
        await s.type(calc.getByTestId("calc-label"), "Omzet per paket");
        await s.talk();
        await addMeasure(calc, "Omzet (Rp)");
        await s.talk();
        await s.click(opButton(calc, "÷"), 700);
        await addMeasure(calc, "Jumlah paket");
        await calc.getByTestId("calc-preview-text").scrollIntoViewIfNeeded();
        await expect(calc.getByTestId("calc-sample-value")).not.toHaveText("");
        await s.step(1500);
        await s.talk();
        await s.choose(calc.getByLabel("Format nilai", { exact: true }), "Rupiah (Rp 1.234)");
        await s.idle(800);
        await s.click(calc.getByTestId("calc-save"), 1200);
        await expect(editorPage.getByTestId("calc-formula").last()).toBeVisible();
        await editorPage.getByTestId("calc-formula").last().scrollIntoViewIfNeeded();
        await s.talk();
        await s.click(editorPage.getByTestId("saved-pivot-save"), 1500);
        await p.waitForURL(/\?pivot=dibuat/);
        const row = p.getByTestId("saved-pivot-row").and(p.locator(`[data-name="${SAVED_PIVOT}"]`));
        await row.scrollIntoViewIfNeeded();
        await s.step(1800);

        // 2. Dua widget di dashboard memakai pivot yang sama (grafik + angka).
        await p.goto(`/dashboards/${dash.id}?mode=edit`);
        const bind = async (title: string, type: string) => {
          await s.click(
            p
              .getByTestId("canvas-toolbar")
              .getByRole("button", { name: "Tambah widget", exact: true }),
          );
          const panel = p.getByTestId("widget-panel");
          await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeVisible();
          const judul = panel.getByLabel("Judul", { exact: true });
          await judul.fill("");
          await s.type(judul, title);
          await judul.press("Enter");
          await s.click(panel.getByTestId("widget-source").getByText("Pivot tersimpan"), 700);
          await s.click(panel.getByText(type, { exact: true }), 700);
          await s.choose(
            panel.getByLabel("Pivot tersimpan yang dipakai", { exact: true }),
            SAVED_PIVOT,
          );
          await expect(panel.getByTestId("bound-source")).toContainText(SAVED_PIVOT);
          return panel;
        };
        await s.talk();
        let panel = await bind(SAVED_CHART, "Batang");
        await s.talk();
        await pickCalc(panel);
        await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
        await s.idle(800);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }).first(), 800);
        await s.talk();
        panel = await bind(SAVED_KPI, "Angka");
        await pickCalc(panel);
        await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
        await s.idle(800);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }).first(), 800);
        await s.talk();
        panel = await bind(SAVED_TABLE, "Pivot");
        await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
        // Lebar penuh: kolom nilai + Omzet per paket muat tanpa digeser.
        for (let i = 0; i < 8; i++)
          await s.click(panel.getByRole("button", { name: `Perlebar ${SAVED_TABLE}` }), 250);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }).first(), 800);
        await s.click(
          p.getByTestId("canvas-toolbar").getByRole("button", { name: "Selesai" }),
          1500,
        );
        const kpi = widgetTitled(p, SAVED_KPI);
        await expect(kpi.getByTestId("kpi-value")).toHaveText(/Rp/, { timeout: 60_000 });
        await widgetTitled(p, SAVED_CHART).evaluate((el) => {
          el.scrollIntoView({ block: "start" });
          window.scrollBy(0, -72);
        });
        await s.step(2000);
        await widgetTitled(p, SAVED_TABLE).evaluate((el) => {
          el.scrollIntoView({ block: "start" });
          window.scrollBy(0, -72);
        });
        await wait(2500);

        // 3. Ubah sekali di pivot tersimpan → semua widget pemakainya berubah.
        await p.goto(`/datasets/${d.id}`);
        await row.scrollIntoViewIfNeeded();
        await s.talk();
        await s.click(row.getByRole("link", { name: `Ubah ${SAVED_PIVOT}` }), 1200);
        const filters = editorPage.getByTestId("pivot-saved-filters");
        await filters.scrollIntoViewIfNeeded();
        await s.click(filters.getByRole("button", { name: "Tambah saringan" }), 700);
        await s.choose(filters.getByLabel("Kolom", { exact: true }), "Layanan");
        await s.click(
          filters.getByTestId("pivot-saved-filter").getByRole("checkbox", { name: "Kilat" }),
          900,
        );
        await s.talk();
        await s.click(editorPage.getByTestId("saved-pivot-save"), 1000);
        const confirm = p.getByTestId("saved-pivot-confirm");
        await expect(confirm).toContainText("3 widget");
        await s.idle(1200);
        await s.click(confirm.getByRole("button", { name: "Simpan", exact: true }), 1200);
        await p.waitForURL(/\?pivot=diubah/);
        await p.goto(`/dashboards/${dash.id}`);
        await expect(widgetTitled(p, SAVED_KPI).getByTestId("kpi-value")).toHaveText(/Rp/, {
          timeout: 60_000,
        });
        await widgetTitled(p, SAVED_CHART).evaluate((el) => {
          el.scrollIntoView({ block: "start" });
          window.scrollBy(0, -72);
        });
        await wait(2500);
        await widgetTitled(p, SAVED_TABLE).evaluate((el) => {
          el.scrollIntoView({ block: "start" });
          window.scrollBy(0, -72);
        });
        await s.step(2500);
      },
    );

    await record(
      browser,
      "pemilik-bagikan",
      { slug: "bagikan-dashboard", title: "Membagikan dashboard" },
      "owner",
      async (s) => {
        const p = s.page;
        const dash = await prisma.dashboard.findFirstOrThrow({
          where: { name: DASHBOARD, dataset: demoOwned },
        });
        await p.goto(`/dashboards/${dash.id}`);
        await s.talk();
        await s.click(p.getByTestId("share-open"), 1200);
        const dialog = p.getByTestId("share-dialog");
        for (const [who, role] of [
          ["viewer", "Hanya lihat"],
          ["editor", "Bisa mengedit widget"],
        ] as const) {
          await s.talk();
          await s.type(dialog.getByTestId("share-search"), ACCOUNTS[who].email.split("@")[0]!);
          await s.click(
            dialog.locator(`[data-testid=share-option][data-email="${ACCOUNTS[who].email}"]`),
            600,
          );
          await s.talk();
          await s.choose(dialog.getByTestId("share-role"), role);
          await s.click(dialog.getByTestId("share-add"), 1500);
        }
        await s.step(2400);
        // Takarir tentang dialog tidak tertinggal setelah dialognya ditutup.
        await s.clear(0);
        await s.click(dialog.getByRole("button", { name: "Selesai" }), 1500);
      },
    );

    await record(
      browser,
      "editor-ubah",
      { slug: "editor-ubah-dashboard", title: "Mengubah dashboard sebagai editor" },
      "editor",
      async (s) => {
        const p = s.page;
        await p.goto("/dashboards");
        await s.step();
        await s.click(p.getByRole("link", { name: DASHBOARD }).first(), 1500);
        await s.talk();
        await s.click(p.getByTestId("edit-dashboard"), 1500);
        const w = widgetTitled(p, "Paket per cabang");
        await s.talk();
        await s.click(w.getByRole("button", { name: "Pengaturan Paket per cabang" }), 900);
        const panel = p.getByTestId("widget-panel");
        await s.click(panel.getByText("Pai", { exact: true }), 1500);
        await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.talk();
        await s.click(
          p.getByTestId("canvas-toolbar").getByRole("button", { name: "Selesai" }),
          2000,
        );
      },
    );

    await record(
      browser,
      "viewer-filter-ekspor",
      { slug: "viewer-lihat-filter-ekspor", title: "Memakai filter dan mengekspor" },
      "viewer",
      async (s) => {
        const p = s.page;
        await p.goto("/dashboards");
        await s.click(p.getByRole("link", { name: DASHBOARD }).first(), 1800);
        await s.talk();
        await s.click(p.locator('[data-testid=filter-slicer][data-column="Cabang"]'), 900);
        for (const v of ["Jakarta", "Bandung"])
          await s.click(p.locator(`[data-testid=filter-slicer-option][data-value="${v}"]`), 500);
        await p.keyboard.press("Escape");
        await s.step(3000);
        await s.talk();
        const w = widgetTitled(p, "Paket per cabang");
        await s.click(w.getByTestId("widget-export"), 900);
        await s.talk();
        await s.click(p.getByTestId("export-xlsx"), 600);
        await expect(p.getByTestId("export-download").first()).toBeVisible({ timeout: 60_000 });
        await s.step(2600);
        await s.talk();
        await p.keyboard.press("Escape");
        await s.click(p.getByTestId("filter-clear-all"), 1500);
        await s.idle(2000);
      },
    );

    await record(
      browser,
      "admin-pengguna",
      { slug: "admin-kelola-pengguna", title: "Mengelola pengguna" },
      "admin",
      async (s) => {
        const p = s.page;
        // Akun contoh fiktif (undangan ke Mailpit lokal); sisa rekaman sebelumnya dihapus dulu.
        const invite = "demo.rina@pcpexpress.com";
        await prisma.user.deleteMany({ where: { email: invite } });
        await p.goto("/");
        await s.talk();
        await s.click(sidebar(p, "Admin"), 1200);
        await s.click(p.getByRole("link", { name: /Pengguna/ }).first(), 1500);
        await s.click(p.getByRole("button", { name: "Tambah pengguna", exact: true }), 800);
        await s.talk();
        const add = p.getByTestId("add-user-dialog");
        await s.type(add.getByRole("textbox", { name: "Email", exact: true }), invite);
        await s.type(add.getByRole("textbox", { name: "Nama", exact: true }), "Rina Wijaya");
        await s.click(add.getByRole("button", { name: "Tambah & kirim undangan" }), 1500);
        await s.step(1500);
        await s.click(add.getByRole("button", { name: "Selesai" }), 1000);
        await s.talk();
        await s.type(p.getByPlaceholder("Cari email atau nama"), "rina");
        await s.click(p.getByRole("button", { name: "Cari" }), 1500);
        // Kalimat tentang isi menu diucapkan selagi menunya terbuka.
        await s.click(p.getByRole("button", { name: `Aksi untuk ${invite}` }), 600);
        await s.step(1500);
        await s.click(p.getByRole("menuitem", { name: "Hapus akun…", exact: true }), 900);
        await s.talk();
        const confirm = p.getByTestId("admin-confirm");
        await s.type(confirm.getByRole("textbox"), invite);
        await s.click(confirm.getByRole("button", { name: "Hapus permanen" }), 1500);
        await s.step(2400);
      },
    );

    await record(
      browser,
      "admin-panduan",
      { slug: "admin-tulis-panduan", title: "Menulis artikel panduan" },
      "admin",
      async (s) => {
        const p = s.page;
        // rekaman bisa diulang (slug unik)
        await prisma.guideArticle.deleteMany({ where: { slug: "contoh-artikel-panduan" } });
        await p.goto("/admin/panduan");
        await s.talk();
        await s.click(p.getByRole("link", { name: "Artikel baru" }), 1200);
        await s.talk();
        await s.type(p.getByLabel("Judul"), "Contoh artikel panduan");
        await s.choose(p.getByLabel("Peran"), "Viewer");
        await s.talk();
        await s.type(
          p.getByLabel("Isi (markdown)"),
          "## Langkah\n\n- Buka **Dashboard**\n- Pilih filter\n",
        );
        await s.talk();
        await s.click(p.getByRole("button", { name: "Simpan sebagai draf" }), 1200);
        await p.waitForURL(/\/admin\/panduan\/[a-z0-9]{20,32}/);
        await p.getByRole("heading", { name: "Video panduan" }).scrollIntoViewIfNeeded();
        await wait(600);
        await s.step(1500);
        await s.click(sidebar(p, "Admin"), 800);
        await p.goto("/admin/panduan");
        // Draf baru ada di akhir daftar: tunjukkan tombol Terbitkan-nya (tidak ditekan).
        const row = p.getByTestId("guide-row").filter({ hasText: "Contoh artikel panduan" });
        await row.scrollIntoViewIfNeeded();
        const publish = await row.getByRole("button", { name: /^Terbitkan/ }).boundingBox();
        if (publish)
          await p.mouse.move(publish.x + publish.width / 2, publish.y + publish.height / 2, {
            steps: 28,
          });
        await s.step(1800);
      },
    );

    await record(
      browser,
      "umum-mengenal",
      { slug: "mengenal-data-dashboard", title: "Masuk dan mengenal menu" },
      null,
      async (s) => {
        const p = s.page;
        // Kartu "Mulai di sini" hanya untuk pengguna yang belum membaca panduan apa pun.
        await prisma.guideRead.deleteMany({ where: { user: { email: ACCOUNTS.viewer.email } } });
        await p.goto("/login");
        await s.talk();
        await s.type(p.getByLabel("Email perusahaan"), ACCOUNTS.viewer.email);
        await s.type(p.locator("input[name=password]"), passwords.viewer);
        await s.talk();
        await s.click(p.getByRole("button", { name: "Masuk" }), 1500);
        await s.step(2400);
        const start = p.getByText("Mulai di sini", { exact: true });
        await start.scrollIntoViewIfNeeded();
        const box = await start.boundingBox();
        if (box) await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
        await s.step(1500);
        await s.talk();
        for (const item of ["Dataset", "Dashboard"]) {
          await s.click(sidebar(p, item), 1600);
        }
        await s.click(sidebar(p, "Panduan"), 1500);
        await s.step(1500);
        await s.talk();
        await s.type(p.getByLabel("Cari panduan"), "filter");
        await s.click(p.getByRole("button", { name: "Cari" }), 1500);
        await s.idle(1500);
      },
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
    rmSync(join(OUT, ".raw"), { recursive: true, force: true });
    for (const who of Object.keys(ACCOUNTS))
      rmSync(join(OUT, `.state-${who}.json`), { force: true });
  }
  if (!ONLY) {
    writeFileSync(join(OUT, "videos.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    // Durasi + poster dihitung di sini (ffmpeg lokal), bukan di image produksi.
    execFileSync("node", ["scripts/guide-video-meta.mjs", OUT], { stdio: "inherit" });
  } else console.log(JSON.stringify(manifest, null, 2));
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exitCode = 1;
});
