/*
 * Dev saja (T-xfzy): rekam video panduan per peran dengan Playwright terhadap app yang berjalan, lalu
 * tulis manifest untuk seed-guides.ts. Video = webm 1280×720 tanpa suara; takarir langkah tampil di
 * layar dan titik biru mengikuti kursor (klik terlihat). Akun dan data demo fiktif (tanpa data pribadi).
 *   node scripts/with-demo-env.mjs npx tsx --env-file-if-exists=.env scripts/record-guide-videos.ts \
 *     [--only adegan1,adegan2]
 * Butuh: dev server + worker yang juga dijalankan lewat with-demo-env.mjs (DB demo bersih, tanpa user
 * nyata) dan isi panduan sudah di-seed ke DB demo. Keluaran: demo/guide-videos/*.webm +
 * videos.json, lalu: npx tsx --conditions=react-server --env-file-if-exists=.env scripts/seed-guides.ts
 *   --videos demo/guide-videos
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";

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
  constructor(readonly page: Page) {
    page.on("load", () => void this.apply());
  }
  private apply() {
    return this.page
      .evaluate(`window.__cap && window.__cap(${JSON.stringify(this.caption)})`)
      .catch(() => {});
  }
  async say(text: string, ms = 2600) {
    this.caption = text;
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
const manifest: { slug: string; file: string; title: string }[] = [];

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
  const page = await ctx.newPage();
  const scene = new Scene(page);
  try {
    await fn(scene);
    await scene.say("", 600);
  } finally {
    const video = page.video();
    await ctx.close();
    if (video) renameSync(await video.path(), join(OUT, `${name}.webm`));
  }
  manifest.push({ slug: meta.slug, file: `${name}.webm`, title: meta.title });
  console.log(`terekam: ${name}`);
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
        await s.say("Dataset adalah wadah data Anda. Mulai dengan Buat dataset.");
        await s.click(p.getByRole("link", { name: "Buat dataset" }).first(), 600);
        await s.say("Isi nama dataset, lalu tekan Buat dataset.", 600);
        await s.type(p.getByLabel("Nama dataset"), DATASET);
        await s.click(p.getByRole("button", { name: "Buat dataset" }), 300);
        await s.say("Pilih atau seret file .xlsx / .csv, maksimal 1 GB.", 2400);
        await s.page.hover('[data-testid="upload-dropzone"] button');
        await wait(600);
        await p.getByTestId("upload-input").setInputFiles(DATA);
        await s.say(
          "File diunggah lalu diproses otomatis. Unggahan yang terputus bisa dilanjutkan.",
          1500,
        );
        await expect(p.getByTestId("dataset-active")).toBeVisible({ timeout: 120_000 });
        await s.say("Selesai: Data aktif menampilkan nama file dan waktu pembaruannya.", 3000);
        await s.click(p.getByTestId("dataset-schema-link"), 1500);
        await s.say("Lanjutkan ke skema untuk memastikan setiap kolom terbaca benar.", 3000);
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
        await s.say("Halaman skema: nama dan tipe tiap kolom hasil deteksi otomatis.", 3200);
        // Nama kolom ada di nilai <input> (bukan teks): kolom ke-5 file demo = Omzet.
        const col = p.getByTestId("schema-column").nth(4);
        await expect(col.getByLabel("Nama kolom")).toHaveValue("Omzet");
        await col.scrollIntoViewIfNeeded();
        await s.say("Ganti nama kolom agar mudah dibaca di dashboard.", 1200);
        const nama = col.getByLabel("Nama kolom");
        await nama.fill("");
        await s.type(nama, "Omzet (Rp)");
        await s.say("Tipe kolom bisa diubah: teks, angka, tanggal, atau ya/tidak.", 2600);
        await s.say("Perubahan berlaku setelah Simpan perubahan — tanpa unggah ulang.", 1200);
        await s.click(
          p.getByTestId("schema-save-bar").getByRole("button", { name: "Simpan perubahan" }),
          1500,
        );
        await expect(p.getByTestId("recast-done")).toBeVisible({ timeout: 120_000 });
        await s.say("Selesai diterapkan. Contoh data menampilkan 50 baris pertama.", 1500);
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
        await s.say("Buat dashboard dari dataset Anda.");
        await s.click(p.getByRole("link", { name: "Buat dashboard" }).first(), 1200);
        // Opsi berlabel "<nama> (n/maks dashboard)".
        await s.click(p.getByLabel("Dataset"), 400);
        await s.click(p.getByRole("option", { name: new RegExp(`^${DATASET}`) }), 600);
        await s.type(p.getByLabel("Nama dashboard"), DASHBOARD);
        await s.click(p.getByRole("button", { name: "Buat dashboard" }), 1800);
        await s.say("Mode edit: tambah widget, perubahan tersimpan otomatis.", 1500);
        let panel = await addWidget(s, "Total omzet", "Angka");
        await s.choose(panel.getByLabel("Nilai", { exact: true }), "Total");
        await s.choose(panel.getByLabel("dari kolom", { exact: true }), "Omzet (Rp)");
        await s.choose(panel.getByLabel("Format angka", { exact: true }), "Rupiah (Rp 1.234)");
        await s.say("Widget Angka (KPI) menampilkan satu nilai ringkas.", 2200);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        panel = await addWidget(s, "Paket per cabang", "Batang");
        await s.choose(panel.getByLabel("Nilai", { exact: true }), "Total");
        await s.choose(panel.getByLabel("dari kolom", { exact: true }), "Jumlah paket");
        await s.say("Grafik batang: kelompokkan menurut Cabang, nilai Total jumlah paket.", 2800);
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        panel = await addWidget(s, "Omzet per bulan", "Garis");
        await s.choose(panel.getByLabel("Kelompokkan menurut", { exact: true }), "Tanggal kirim");
        await s.choose(panel.getByLabel("Rentang waktu", { exact: true }), "Per bulan");
        await s.choose(panel.getByLabel("dari kolom", { exact: true }), "Omzet (Rp)");
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.say("Tambahkan kolom filter agar pembaca bisa menyaring data.", 1200);
        const filters = p.getByTestId("dashboard-filter-columns");
        await s.click(filters.getByRole("button", { name: "Tambah kolom filter" }), 600);
        await s.click(p.getByRole("menuitem", { name: /^Cabang/ }), 1200);
        await s.click(
          p.getByTestId("canvas-toolbar").getByRole("button", { name: "Selesai" }),
          1500,
        );
        await s.say("Dashboard siap dilihat.", 3000);
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
        await s.say("Bagikan dashboard ke rekan lewat tombol Bagikan.");
        await s.click(p.getByTestId("share-open"), 1200);
        const dialog = p.getByTestId("share-dialog");
        for (const [who, role] of [
          ["viewer", "Hanya lihat"],
          ["editor", "Bisa mengedit widget"],
        ] as const) {
          await s.type(dialog.getByTestId("share-search"), ACCOUNTS[who].email.split("@")[0]!);
          await s.click(
            dialog.locator(`[data-testid=share-option][data-email="${ACCOUNTS[who].email}"]`),
            600,
          );
          await s.say(`Peran: ${role}.`, 600);
          await s.choose(dialog.getByTestId("share-role"), role);
          await s.click(dialog.getByTestId("share-add"), 1500);
        }
        await s.say("Atau bagikan ke seluruh organisasi (hanya lihat).", 2400);
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
        await s.say("Dashboard yang dibagikan kepada Anda ada di Dibagikan ke saya.");
        await s.click(p.getByRole("link", { name: DASHBOARD }).first(), 1500);
        await s.say("Sebagai editor, tekan Ubah tata letak untuk mengubah widget.", 1200);
        await s.click(p.getByTestId("edit-dashboard"), 1500);
        const w = widgetTitled(p, "Paket per cabang");
        await s.click(w.getByRole("button", { name: "Pengaturan Paket per cabang" }), 900);
        const panel = p.getByTestId("widget-panel");
        await s.say("Ganti jenis tampilan, mis. menjadi grafik Pai.", 900);
        await s.click(panel.getByText("Pai", { exact: true }), 1500);
        await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
        await s.click(panel.getByRole("button", { name: "Tutup pengaturan" }), 800);
        await s.say("Tersimpan otomatis. Tekan Selesai untuk kembali ke mode lihat.", 1200);
        await s.click(
          p.getByTestId("canvas-toolbar").getByRole("button", { name: "Selesai" }),
          2500,
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
        await s.say("Saring data lewat bilah Filter, mis. pilih cabang.", 1000);
        await s.click(p.locator('[data-testid=filter-slicer][data-column="Cabang"]'), 900);
        for (const v of ["Jakarta", "Bandung"])
          await s.click(p.locator(`[data-testid=filter-slicer-option][data-value="${v}"]`), 500);
        await p.keyboard.press("Escape");
        await s.say("Semua widget mengikuti filter yang aktif.", 3000);
        await s.say("Ekspor data widget ke CSV atau Excel lewat ikon ekspor.", 900);
        const w = widgetTitled(p, "Paket per cabang");
        await s.click(w.getByTestId("widget-export"), 900);
        await s.click(p.getByTestId("export-xlsx"), 600);
        await expect(p.getByTestId("export-download").first()).toBeVisible({ timeout: 60_000 });
        await s.say("File siap diunduh.", 2600);
        await p.keyboard.press("Escape");
        await s.click(p.getByTestId("filter-clear-all"), 1500);
        await s.say("Hapus semua filter untuk kembali ke seluruh data.", 2500);
      },
    );

    await record(
      browser,
      "admin-pengguna",
      { slug: "admin-kelola-pengguna", title: "Mengelola pengguna" },
      "admin",
      async (s) => {
        const p = s.page;
        await p.goto("/");
        await s.say("Admin mengelola pengguna lewat menu Admin.", 1000);
        await s.click(sidebar(p, "Admin"), 1200);
        await s.click(p.getByRole("link", { name: /Pengguna/ }).first(), 1500);
        await s.type(p.getByPlaceholder("Cari email atau nama"), "demo");
        await s.click(p.getByRole("button", { name: "Cari" }), 1500);
        await s.say("Menu Aksi: jadikan admin, nonaktifkan, aktifkan, atau alihkan dataset.", 900);
        await s.click(p.getByRole("button", { name: `Aksi untuk ${ACCOUNTS.viewer.email}` }), 2600);
        await p.keyboard.press("Escape");
        await s.say("Setiap aksi dicatat di log audit.", 2400);
      },
    );

    await record(
      browser,
      "admin-panduan",
      { slug: "admin-tulis-panduan", title: "Menulis artikel panduan" },
      "admin",
      async (s) => {
        const p = s.page;
        await p.goto("/admin/panduan");
        await s.say("Artikel panduan ditulis admin di Admin → Panduan.");
        await s.click(p.getByRole("link", { name: "Artikel baru" }), 1200);
        await s.type(p.getByLabel("Judul"), "Contoh artikel panduan");
        await s.say("Pilih peran pembaca dan, bila perlu, halaman bantuannya.", 900);
        await s.choose(p.getByLabel("Peran"), "Viewer");
        await s.type(
          p.getByLabel("Isi (markdown)"),
          "## Langkah\n\n- Buka **Dashboard**\n- Pilih filter\n",
        );
        await s.say(
          "Pratinjau tampil di samping. Simpan sebagai draf, lalu terbitkan dari daftar.",
          3600,
        );
      },
    );

    await record(
      browser,
      "umum-mengenal",
      { slug: "mengenal-data-dashboard", title: "Masuk dan mengenal menu" },
      null,
      async (s) => {
        const p = s.page;
        await p.goto("/login");
        await s.say("Masuk dengan email perusahaan Anda.");
        await s.type(p.getByLabel("Email perusahaan"), ACCOUNTS.viewer.email);
        await s.type(p.locator("input[name=password]"), passwords.viewer);
        await s.click(p.getByRole("button", { name: "Masuk" }), 1500);
        await s.say("Beranda menampilkan dataset dan dashboard yang bisa Anda akses.", 3200);
        await s.say("Menu kiri: Beranda, Dataset, Dashboard, dan Panduan.", 1200);
        for (const item of ["Dataset", "Dashboard"]) {
          await s.click(sidebar(p, item), 1600);
        }
        await s.click(sidebar(p, "Panduan"), 1500);
        await s.say(
          "Panduan menampilkan tab sesuai peran Anda. Cari topik lewat kolom pencarian.",
          3500,
        );
        await s.type(p.getByLabel("Cari panduan"), "filter");
        await s.click(p.getByRole("button", { name: "Cari" }), 2500);
      },
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
    rmSync(join(OUT, ".raw"), { recursive: true, force: true });
    for (const who of Object.keys(ACCOUNTS))
      rmSync(join(OUT, `.state-${who}.json`), { force: true });
  }
  if (!ONLY) writeFileSync(join(OUT, "videos.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  else console.log(JSON.stringify(manifest, null, 2));
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exitCode = 1;
});
