#!/usr/bin/env node
/*
 * Perf "Lihat data" T-061 ujung-ke-ujung terhadap deployment sungguhan (dev server, stack uji, atau VM):
 * Route Handler POST /api/sheets/:id/rows (sesi, rate limit, repo Prisma, cache parquet aplikasi, gerbang
 * grid, DuckDB), halaman /datasets/:id/data di Chromium (waktu sampai baris berisi data TAMPIL), dan uji
 * beban 5 penggulir + dashboard 6 widget lewat /api/query.
 *   PERF_BASE=https://host PERF_USERS=users.json [PERF_PARTS=api,ui,beban] \
 *     node scripts/perf-grid-http.mjs <seed.json> [reps]
 * seed.json = keluaran scripts/dev-grid-perf-seed.ts. users.json = [{email,password}, …] ≥ 6 akun:
 * akun 0 = pemilik dataset (dashboard), akun 1–5 = editor dashboard (penggulir; akun 5 juga browser). Klien patuh
 * rate limit grid (≤ 280 permintaan/menit per akun). Keluaran: satu baris JSON per hasil, terakhir
 * {"ev":"ringkasan",…}. Bukan bagian `npm run check`.
 */
/* global document -- dijalankan di halaman lewat page.evaluate/waitForFunction */
import { readFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { chromium } from "playwright-core";

const BASE = process.env.PERF_BASE;
const USERS = JSON.parse(readFileSync(process.env.PERF_USERS ?? "users.json", "utf8"));
const SEED = JSON.parse(readFileSync(process.argv[2], "utf8"));
const REPS = Number(process.argv[3] ?? 30);
/** Bagian yang dijalankan (PERF_PARTS=api,ui,beban; bawaan semua). */
const PARTS = (process.env.PERF_PARTS ?? "api,ui,beban").split(",");
const ROWS = SEED.rows;
const CITIES = [
  "Jakarta Selatan",
  "Jakarta Barat",
  "Bandung",
  "Surabaya",
  "Medan",
  "Semarang",
  "Makassar",
  "Denpasar",
  "Balikpapan",
  "Yogyakarta",
];
/** Rate limit grid 300/menit per akun: jarak minimum antar permintaan satu akun. */
const GAP_MS = 215;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo));
const out = {};
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return s.length
    ? { n: s.length, p50: Math.round(q(0.5)), p95: Math.round(q(0.95)), max: Math.round(s.at(-1)) }
    : { n: 0 };
}

async function login(browser, user) {
  const context = await browser.newContext({
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const r = await context.request.post("/api/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: BASE },
  });
  if (!r.ok()) throw new Error(`login ${user.email}: ${r.status()}`);
  let next = 0;
  /** POST JSON dengan jarak minimum per akun (rate limit); ms = waktu tunggu jawaban klien. */
  const post = async (path, data, paced = true) => {
    if (paced) {
      const wait = next - Date.now();
      next = Math.max(Date.now(), next) + GAP_MS;
      if (wait > 0) await sleep(wait);
    }
    const t0 = performance.now();
    const res = await context.request.post(path, {
      data,
      headers: { Origin: BASE },
      timeout: 120_000,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status(), body, ms: performance.now() - t0 };
  };
  return { context, post, user };
}

const cols = Array.from({ length: 30 }, (_, i) => i + 1);
const rowsBody = (extra) => ({ versionId: SEED.versionId, rowCount: 200, cols, ...extra });
const rowsPath = `/api/sheets/${SEED.sheetId}/rows`;

/** Skenario API berurutan, dibagi bergiliran ke semua akun (rate limit), REPS kali masing-masing. */
async function apiScenarios(accts) {
  let k = 0;
  const call = async (extra) => {
    const a = accts[k++ % accts.length];
    const r = await a.post(rowsPath, rowsBody(extra));
    if (r.status !== 200)
      throw new Error(`rows ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return r;
  };
  const SORT_TEXT = [{ pos: 4, dir: "asc" }];
  const sortTotal = (await call({ rowStart: 0, sort: SORT_TEXT })).body.filteredTotal;
  const scenarios = [
    ["ujung (rows-200)", () => call({ rowStart: ROWS - 200 })],
    ["acak", () => call({ rowStart: rand(0, ROWS - 200) })],
    ["urut angka pertama", () => call({ rowStart: 0, sort: [{ pos: rand(11, 21), dir: "desc" }] })],
    ["urut teks pertama", () => call({ rowStart: 0, sort: [{ pos: rand(4, 10), dir: "asc" }] })],
    [
      "urut teks dalam",
      () => call({ rowStart: rand(sortTotal / 4, sortTotal - 200), sort: SORT_TEXT }),
    ],
    [
      // Batas bawah acak → kunci count baru tiap putaran (count belum di-cache = blok pertama).
      "saring pertama",
      () =>
        call({
          rowStart: 0,
          filters: [
            { pos: 2, op: "in", values: [CITIES[rand(0, 10)]] },
            { pos: 12, op: "range", gte: rand(0, 100000), lte: 600000 },
          ],
        }),
    ],
    [
      "cari 10 kolom pertama",
      () =>
        call({
          rowStart: 0,
          search: { text: `pelanggan ${rand(1, 199999)}`, cols: cols.slice(0, 10) },
        }),
    ],
  ];
  for (const [name, fn] of scenarios) {
    const ms = [];
    for (let i = 0; i < REPS; i++) ms.push((await fn()).ms);
    out[`api ${name}`] = stats(ms);
    log({ ev: "api", name, ...out[`api ${name}`] });
  }
}

/** Halaman Lihat data: waktu sampai baris berisi data terlihat (klien + jaringan + server). */
async function browserScenarios(owner) {
  const page = await owner.context.newPage();
  // Status jawaban blok baris yang dilihat browser (429/504 = blok gagal, baris tidak pernah tampil).
  const statuses = {};
  page.on("response", (r) => {
    if (r.url().endsWith("/rows")) statuses[r.status()] = (statuses[r.status()] ?? 0) + 1;
  });
  const misses = [];
  /** Ukur satu aksi; gagal tampil dalam 60 s dicatat (dengan isi viewport), bukan menghentikan run. */
  const timed = async (label, fn, into) => {
    try {
      into.push(await fn());
    } catch (e) {
      const seen = await page
        .evaluate(() =>
          [...document.querySelectorAll('[data-testid="sheet-grid"] .ag-row[row-index]')]
            .slice(0, 4)
            .map((r) => `${r.getAttribute("row-index")}:${r.textContent.slice(0, 40)}`),
        )
        .catch(() => []);
      misses.push({ label, error: String(e).slice(0, 120), seen });
    }
  };
  const expect1 = (n) => `PCP${String(n - 1).padStart(11, "0")}`;
  const t0 = performance.now();
  await page.goto(`/datasets/${SEED.datasetId}/data`);
  await page
    .locator('[data-testid="sheet-grid"] .ag-row[row-index="0"] [col-id="c1"]')
    .getByText(expect1(1))
    .waitFor({ timeout: 120_000 });
  out["ui buka halaman (dingin)"] = Math.round(performance.now() - t0);
  log({ ev: "ui", name: "buka halaman", ms: out["ui buka halaman (dingin)"] });

  /** Ke baris n lewat kotak "Ke baris": ms sampai baris itu terlihat penuh berisi data. */
  const goTo = async (n, text) => {
    const input = page.getByTestId("grid-goto-input");
    await input.fill(String(n));
    const start = await page.evaluate(() => performance.now());
    await input.press("Enter");
    const h = await page.waitForFunction(
      ([idx, want]) => {
        const root = document.querySelector('[data-testid="sheet-grid"]');
        const vp = root.querySelector(".ag-grid-viewport");
        const top = root.querySelector(".ag-header").getBoundingClientRect().bottom;
        const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
        const row = vp.querySelector(`.ag-row[row-index="${idx}"]`);
        const r = row?.getBoundingClientRect();
        const t = row?.querySelector('[col-id="c1"]')?.textContent ?? "";
        return r &&
          r.top >= top - 1 &&
          r.bottom <= bottom + 1 &&
          (want ? t === want : /^PCP\d{11}$/.test(t))
          ? performance.now()
          : false;
      },
      [n - 1, text],
      { polling: "raf", timeout: 60_000 },
    );
    return (await h.jsonValue()) - start;
  };
  /** Indeks baris pertama yang terlihat di viewport grid. */
  const firstVisible = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="sheet-grid"]');
      const vp = root.querySelector(".ag-grid-viewport");
      const top = root.querySelector(".ag-header").getBoundingClientRect().bottom;
      const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
      const rows = [...vp.querySelectorAll(".ag-grid-scrolling-rows .ag-row[row-index]")]
        .map((r) => ({ b: r.getBoundingClientRect(), i: Number(r.getAttribute("row-index")) }))
        .filter(({ b }) => b.bottom > top && b.top < bottom)
        .sort((x, y) => x.b.top - y.b.top);
      return rows[0]?.i ?? -1;
    });
  /**
   * Gulir (scrollTop acak, seperti seret thumb): ms sampai viewport menampilkan baris di posisi BARU
   * (indeks pertama bergeser > 1.000) dan semuanya berisi data.
   */
  const scrollTo = async (frac) => {
    const before = await firstVisible();
    const start = await page.evaluate((f) => {
      const el = document.querySelector(
        '[data-testid="sheet-grid"] .ag-body-vertical-scroll-viewport',
      );
      el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * f);
      return performance.now();
    }, frac);
    const h = await page.waitForFunction(
      (prev) => {
        const root = document.querySelector('[data-testid="sheet-grid"]');
        const vp = root.querySelector(".ag-grid-viewport");
        const top = root.querySelector(".ag-header").getBoundingClientRect().bottom;
        const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
        // Baris yang posisinya di viewport, urut posisi; baris lama yang tetap dirender (fokus) punya
        // indeks jauh dari baris teratas, jadi hanya blok bersambung dari baris teratas yang dinilai.
        const rows = [...vp.querySelectorAll(".ag-grid-scrolling-rows .ag-row[row-index]")]
          .map((r) => ({ r, b: r.getBoundingClientRect(), i: Number(r.getAttribute("row-index")) }))
          .filter(({ b }) => b.bottom > top && b.top < bottom)
          .sort((x, y) => x.b.top - y.b.top);
        const first = rows[0]?.i ?? prev;
        const block = rows.filter(({ i }) => i >= first && i < first + 60);
        return block.length > 10 &&
          Math.abs(first - prev) > 1000 &&
          block.every(
            ({ r }) =>
              /^PCP\d{11}$/.test(r.querySelector('[col-id="c1"]')?.textContent ?? "") ||
              r.textContent.includes("Akhir data"),
          )
          ? performance.now()
          : false;
      },
      before,
      { polling: "raf", timeout: 60_000 },
    );
    return (await h.jsonValue()) - start;
  };

  const goto9 = [];
  const gotoRand = [];
  const scroll = [];
  for (let i = 0; i < REPS; i++) {
    // Selang-seling target agar blok tidak dari cache klien.
    await timed("ke baris acak", () => goTo(rand(1, ROWS), null), gotoRand);
    await timed(
      "ke baris ~9 jt",
      () => goTo(9_000_000 - rand(0, 2) * 100_000 * (i % 2), null),
      goto9,
    );
    // "Ke baris" masih menyelesaikan posisi/fokus beberapa frame setelah baris tampil; gulir yang
    // terlalu cepat sesudahnya dikembalikan grid ke baris itu (artefak uji, bukan pola pengguna).
    await sleep(500);
    await timed("gulir", () => scrollTo(0.05 + 0.9 * Math.random()), scroll);
    await sleep(600); // ± 3 blok per aksi: tetap di bawah rate limit grid akun ini
  }
  out["ui ke baris ~9.000.000"] = stats(goto9);
  out["ui ke baris acak"] = stats(gotoRand);
  out["ui gulir acak sampai tampil"] = stats(scroll);
  for (const k of ["ui ke baris ~9.000.000", "ui ke baris acak", "ui gulir acak sampai tampil"])
    log({ ev: "ui", name: k, ...out[k] });

  // Urut teks lewat klik kepala kolom Pelanggan: blok pertama tampil, lalu blok dalam.
  const sortFirst = [];
  const sortDeep = [];
  const head = page.locator('[data-testid="sheet-grid"] .ag-header-cell[col-id="c4"]');
  for (let i = 0; i < Math.min(REPS, 10); i++) {
    await goTo(1, expect1(1));
    const start = await page.evaluate(() => performance.now());
    await head.getByTestId("grid-header-sort").click();
    const h = await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="sheet-grid"] .ag-row[row-index="0"] [col-id="c4"]')
          ?.textContent === "Pelanggan 0"
          ? performance.now()
          : false,
      undefined,
      { polling: "raf", timeout: 60_000 },
    );
    sortFirst.push((await h.jsonValue()) - start);
    await timed("urut teks ke baris dalam", () => goTo(rand(ROWS / 4, ROWS - 1), null), sortDeep);
    await sleep(600);
    // naik → turun → tanpa urut
    await head.getByTestId("grid-header-sort").click();
    await head.getByTestId("grid-header-sort").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="sheet-grid"] .ag-header-cell[col-id="c4"]')
          ?.getAttribute("aria-sort") === "none",
    );
  }
  out["ui urut teks blok pertama"] = stats(sortFirst);
  out["ui urut teks ke baris dalam"] = stats(sortDeep);
  out["ui status blok baris"] = statuses;
  out["ui gagal tampil"] = misses;
  log({ ev: "ui", name: "status blok", statuses, misses });
  log({
    ev: "ui",
    name: "urut teks",
    first: out["ui urut teks blok pertama"],
    deep: out["ui urut teks ke baris dalam"],
  });
  await page.close();
}

/** 6 widget (KPI ×2, batang ×2, garis per bulan, tabel 50 baris urut) atas seluruh sheet. */
async function makeWidgets(owner) {
  const s = SEED.sheetId;
  const FMT = { style: "auto", decimals: 0 };
  const chart = (column, measure, extra = {}) => ({
    sheetId: s,
    dimension: { column, ...extra },
    measure,
    sort: "value_desc",
    topN: 12,
    format: FMT,
  });
  const plan = [
    ["Jumlah baris", "kpi", { sheetId: s, measure: { agg: "count" }, format: FMT }],
    ["Total nilai", "kpi", { sheetId: s, measure: { agg: "sum", column: 11 }, format: FMT }],
    ["Nilai per kota", "bar", chart(2, { agg: "sum", column: 12 })],
    ["Baris per layanan", "bar", chart(3, { agg: "count" })],
    [
      "Tren per bulan",
      "line",
      {
        ...chart(26, { agg: "sum", column: 13 }, { timeGrain: "month" }),
        sort: "label_desc",
        topN: 365,
      },
    ],
    ["Detail", "table", { sheetId: s, columns: [1, 2, 11, 21, 26], format: FMT }],
  ];
  const ids = [];
  // Revisi layout: 0 untuk dashboard baru dari seed; run ulang atas seed yang sama → naikkan sampai
  // tidak STALE (409).
  let revision = 0;
  for (const [i, [title, type, spec]] of plan.entries()) {
    const add = () =>
      owner.post(
        `/api/dashboards/${SEED.dashboardId}/widgets`,
        {
          baseRevision: revision,
          title,
          type,
          spec,
          at: { x: (i % 3) * 4, y: Math.floor(i / 3) * 4, w: 4, h: 4 },
        },
        false,
      );
    let r = await add();
    while (r.status === 409 && i === 0 && revision < 500) {
      revision++;
      r = await add();
    }
    if (r.status !== 200) throw new Error(`widget ${title}: ${r.status} ${JSON.stringify(r.body)}`);
    revision = r.body.data.layoutRevision;
    ids.push(r.body.data.widget.id);
  }
  const fc = await owner.context.request.patch(
    `/api/dashboards/${SEED.dashboardId}/filter-columns`,
    {
      data: { filterColumns: [{ sheet: "Pengiriman", column: "Kota Tujuan" }] },
      headers: { Origin: BASE },
    },
  );
  if (!fc.ok()) throw new Error(`filter-columns ${fc.status()}`);
  return ids;
}

/** Dashboard 6 widget paralel (akun pemilik); kota acak tiap putaran → cache hasil dingin. */
async function loadTest(owner, scrollers, widgetIds, variant) {
  const codes = {};
  let round = 0;
  const dashboard = async (widget, dash) => {
    round++;
    // Himpunan kota unik per putaran (bit pola) agar hasil tidak dari cache.
    const pick = CITIES.filter((_, b) => ((round * 7919 + Date.now()) >> b) & 1);
    const filters = [{ column: "Kota Tujuan", op: "in", values: pick.length ? pick : [CITIES[0]] }];
    const t0 = performance.now();
    await Promise.all(
      widgetIds.map(async (widgetId) => {
        const r = await owner.post("/api/query", { widgetId, dashboardFilters: filters }, false);
        if (r.status === 200) widget.push(r.ms);
        else codes[r.body?.code ?? r.status] = (codes[r.body?.code ?? r.status] ?? 0) + 1;
      }),
    );
    dash.push(performance.now() - t0);
  };
  const baseW = [];
  const baseD = [];
  await dashboard([], []);
  for (let i = 0; i < REPS; i++) await dashboard(baseW, baseD);
  const sortTotal = ROWS;
  let stop = false;
  const grid = { ok: 0, codes: {}, ms: [] };
  const scroll = async (a) => {
    while (!stop) {
      const extra =
        variant === "polos"
          ? { rowStart: rand(0, ROWS - 200) }
          : { rowStart: rand(sortTotal / 4, sortTotal - 200), sort: [{ pos: 4, dir: "asc" }] };
      const r = await a.post(rowsPath, rowsBody(extra));
      if (r.status === 200) {
        grid.ok++;
        grid.ms.push(r.ms);
      } else grid.codes[r.body?.code ?? r.status] = (grid.codes[r.body?.code ?? r.status] ?? 0) + 1;
    }
  };
  const runners = scrollers.flatMap((a) => [scroll(a), scroll(a)]);
  await sleep(1000);
  const loadW = [];
  const loadD = [];
  const load1 = loadavg()[0];
  for (let i = 0; i < REPS; i++) await dashboard(loadW, loadD);
  stop = true;
  await Promise.all(runners);
  const res = {
    base: { widget: stats(baseW), dash: stats(baseD) },
    loaded: { widget: stats(loadW), dash: stats(loadD) },
    ratioWidgetP95: Math.round((stats(loadW).p95 / stats(baseW).p95) * 100) / 100,
    widgetErrors: codes,
    grid: { ok: grid.ok, errors: grid.codes, ms: stats(grid.ms) },
    load1,
  };
  out[`beban ${variant}`] = res;
  log({ ev: "beban", variant, ...res });
}

const browser = await chromium.launch();
try {
  if (USERS.length < 6) throw new Error("butuh ≥ 6 akun (pemilik + 5 penggulir)");
  const accts = [];
  for (const u of USERS.slice(0, 6)) accts.push(await login(browser, u));
  const [owner, ...scrollers] = accts;
  out.meta = { base: BASE, seed: SEED, reps: REPS, clientCpus: cpus().length, load1: loadavg()[0] };
  // Akun 0–4 untuk skenario API, akun 5 untuk browser (jatah rate limit terpisah).
  if (PARTS.includes("api")) await apiScenarios(accts.slice(0, 5));
  if (PARTS.includes("ui")) await browserScenarios(accts[5]);
  if (PARTS.includes("beban")) {
    const widgetIds = await makeWidgets(owner);
    await sleep(61_000); // jendela rate limit grid kosong sebelum uji beban
    await loadTest(owner, scrollers, widgetIds, "polos");
    await loadTest(owner, scrollers, widgetIds, "urut teks");
  }
  log({ ev: "ringkasan", ...out });
} finally {
  await browser.close();
}
