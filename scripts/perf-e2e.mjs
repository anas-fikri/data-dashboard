#!/usr/bin/env node
/*
 * Uji performa ujung-ke-ujung T-024 terhadap deployment sungguhan: Chromium headless memakai UI yang
 * sama dengan pengguna (buat dataset, panel unggah, buat dashboard) + API publik (widget, query).
 *   node scripts/perf-e2e.mjs single <file> [indeks-akun]
 *     unggah → ingest → dashboard 10 widget → buka dashboard (dingin) → buka dengan filter → p95 query
 *   node scripts/perf-e2e.mjs concurrent <file> <n>
 *     n akun mengunggah bersamaan (AC 2): maks job ingest berjalan bersamaan + posisi antrean API/UI
 *   node scripts/perf-e2e.mjs dashboard <datasetId> [indeks-akun]
 *     hanya tahap dashboard di atas dataset READY milik akun itu (ulang ukur tanpa unggah ulang)
 *   node scripts/perf-e2e.mjs tiers <file>...
 *     jenjang ukuran (T-1w0b), urut sesuai argumen: per file buat dataset → unggah → tunggu siap →
 *     hapus dataset lewat UI; berhenti sebelum jenjang berikutnya bila PERF_OUT/STOP ada (pemantau
 *     beban host scripts/perf-tiers.sh) atau ingest gagal
 * Env: PERF_BASE (mis. https://10.3.3.221:9543), PERF_USERS (users.json dari deploy/perf-stack.sh).
 * Keluaran stdout: satu baris JSON per peristiwa, baris terakhir {"ev":"ringkasan",...}.
 * Bukan bagian `npm run check`; dijalankan lewat scripts/perf-e2e.sh di VM.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.PERF_BASE;
const USERS = JSON.parse(readFileSync(process.env.PERF_USERS ?? "users.json", "utf8"));
const [mode, file, arg] = process.argv.slice(2);
const DONE = new Set(["READY", "AWAITING_MAPPING", "AWAITING_CONFIRM", "FAILED"]);
const NUM = new Set(["integer", "decimal"]);
const DATE = new Set(["date", "timestamp"]);
const FMT = { style: "auto", decimals: 0 };
const QUERY_ROUNDS = 5;
const LONG = 60 * 60_000;
/** Folder hasil (PERF_OUT) untuk tangkapan layar saat gagal; kosong = tanpa tangkapan. */
const OUT = process.env.PERF_OUT ?? "";

/** Tunggu navigasi; gagal → catat alert/galat di halaman + tangkapan layar, lalu lempar lagi. */
async function waitNav(page, re, label) {
  try {
    await page.waitForURL(re, { timeout: 120_000 });
  } catch (e) {
    const alerts = await page
      .locator('[role="alert"], [aria-live="assertive"]')
      .allInnerTexts()
      .catch(() => []);
    log({
      ev: "gagal-navigasi",
      label,
      url: page.url(),
      alerts: alerts.filter(Boolean).slice(0, 5),
    });
    if (OUT)
      await page.screenshot({ path: `${OUT}/gagal-${label}.png`, fullPage: true }).catch(() => {});
    throw e;
  }
}

/** Nama dataset/dashboard unik per pemilik: akhiran jam agar run ulang tidak bentrok. */
const RUN = new Date().toISOString().slice(11, 19);

const sec = (ms) => Math.round(ms / 100) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return {
    n: s.length,
    p50: Math.round(q(0.5)),
    p95: Math.round(q(0.95)),
    max: Math.round(s.at(-1)),
  };
}

async function login(browser, user) {
  const context = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
  const r = await context.request.post("/api/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: BASE },
  });
  if (!r.ok()) throw new Error(`login ${user.email}: ${r.status()} ${await r.text()}`);
  return context;
}

/** API publik dengan sesi context; Origin wajib untuk rute yang mengubah data dan /api/query. */
function api(context) {
  const call = async (method, path, data) => {
    const started = performance.now();
    const r = await context.request.fetch(path, {
      method,
      data,
      headers: { Origin: BASE },
      timeout: 120_000,
    });
    const body = await r.json().catch(() => null);
    return { status: r.status(), body, ms: performance.now() - started };
  };
  return {
    get: (path) => call("GET", path),
    post: (path, data) => call("POST", path, data),
    patch: (path, data) => call("PATCH", path, data),
  };
}

async function createDataset(page, name) {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await waitNav(page, /\/datasets\/[a-z0-9]{20,32}/, "buat-dataset");
  return new URL(page.url()).pathname.split("/").pop();
}

/** Panel unggah sungguhan (multipart presigned lewat proxy storage); selesai = teks "terunggah". */
async function upload(page, path) {
  const started = performance.now();
  await page.getByTestId("upload-input").setInputFiles(path);
  await page.getByText(`"${basename(path)}" terunggah.`).waitFor({ timeout: LONG });
  return performance.now() - started;
}

async function waitIngest(a, datasetId) {
  const marks = {};
  const stages = [];
  let last = null;
  let stage = null;
  for (;;) {
    const { body } = await a.get(`/api/datasets/${datasetId}/progress`);
    const s = body?.status;
    if (s && s.status !== last) {
      marks[s.status] = performance.now();
      last = s.status;
      log({ ev: "status", datasetId, status: s.status, queue: s.queue ?? null });
    }
    // Tahap ingest (unduh → baca → simpan → tipe) untuk rincian waktu per tahap.
    const st = s?.progress ? `${s.progress.stage}:${s.progress.sheet ?? 0}` : null;
    if (st && st !== stage) {
      stage = st;
      stages.push({ tahap: s.progress.stage, at: performance.now() });
      log({ ev: "tahap", datasetId, tahap: s.progress.stage, sheet: s.progress.sheetName ?? null });
    }
    if (s && DONE.has(s.status))
      return { status: s.status, marks, stages, error: s.errorMessage, sheets: s.sheets };
    await sleep(1000);
  }
}

/** Objek JSON utuh mulai indeks i (string-aware); dipakai membaca props RSC halaman. */
function balanced(s, i) {
  let depth = 0;
  let str = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (str) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') str = false;
    } else if (c === '"') str = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return "";
}

/**
 * Sheet + kolom (id sheet hanya ada di props RSC halaman edit dashboard: getDashboardSources →
 * [{id, name, columns:[{pos, name, type}]}]); tidak ada API GET untuk ini.
 */
async function dashboardSources(context, dashboardId) {
  // HTML mentah: Next mengosongkan self.__next_f setelah hidrasi, jadi baca potongan dari tag script.
  const html = await (await context.request.get(`/dashboards/${dashboardId}?mode=edit`)).text();
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map((m) => JSON.parse(m[1]))
    .join("");
  const sheets = new Map();
  const re = /\{"id":"[a-z0-9]{20,32}","name":/g;
  for (let m; (m = re.exec(flight));) {
    try {
      const o = JSON.parse(balanced(flight, m.index));
      if (Array.isArray(o.columns) && o.columns.length) sheets.set(o.id, o);
    } catch {
      // bukan objek sumber
    }
  }
  if (!sheets.size) {
    const i = flight.indexOf('"columns"');
    log({
      ev: "diagnosa-sumber",
      flightChars: flight.length,
      sekitarColumns: i < 0 ? null : flight.slice(Math.max(0, i - 200), i + 200),
    });
  }
  return [...sheets.values()];
}

/** 10 widget campuran (KPI, batang, garis, pai, tabel) dari kolom nyata hasil deteksi tipe. */
function widgetPlan(sheets) {
  const [s, s2] = sheets;
  const text = s.columns.filter((c) => c.type === "text");
  const num = s.columns.filter((c) => NUM.has(c.type));
  const date = s.columns.filter((c) => DATE.has(c.type));
  const t = (i) => (text.length ? text[i % text.length].pos : s.columns[i % s.columns.length].pos);
  const sum = (i) =>
    num.length ? { agg: "sum", column: num[i % num.length].pos } : { agg: "count" };
  const avg = (i) =>
    num.length ? { agg: "avg", column: num[i % num.length].pos } : { agg: "count" };
  const chart = (sheetId, column, measure, extra = {}) => ({
    sheetId,
    dimension: { column, ...extra },
    measure,
    sort: "value_desc",
    topN: 12,
    format: FMT,
  });
  const plan = [
    ["Jumlah baris", "kpi", { sheetId: s.id, measure: { agg: "count" }, format: FMT }],
    ["Total nilai", "kpi", { sheetId: s.id, measure: sum(0), format: FMT }],
    [
      "Kategori unik",
      "kpi",
      { sheetId: s.id, measure: { agg: "count_distinct", column: t(0) }, format: FMT },
    ],
    ["Total per kategori", "bar", chart(s.id, t(0), sum(0))],
    ["Baris per kategori 2", "bar", chart(s.id, t(1), { agg: "count" })],
    ["Rata-rata per kategori", "bar", chart(s.id, t(2), avg(1))],
    ["Porsi kategori", "pie", { ...chart(s.id, t(3), { agg: "count" }), topN: 5 }],
    date.length
      ? [
          "Tren per bulan",
          "line",
          {
            ...chart(s.id, date[0].pos, sum(0), { timeGrain: "month" }),
            sort: "label_desc",
            topN: 365,
          },
        ]
      : [
          "Maksimum per kategori",
          "bar",
          chart(s.id, t(4), num.length ? { agg: "max", column: num[0].pos } : { agg: "count" }),
        ],
    [
      "Detail",
      "table",
      { sheetId: s.id, columns: s.columns.slice(0, 8).map((c) => c.pos), format: FMT },
    ],
    s2
      ? [
          "Sheet 2 per kategori",
          "bar",
          chart(s2.id, (s2.columns.find((c) => c.type === "text") ?? s2.columns[0]).pos, {
            agg: "count",
          }),
        ]
      : ["Baris per kategori 3", "bar", chart(s.id, t(5), { agg: "count" })],
  ];
  return plan.map(([title, type, spec], i) => ({
    title,
    type,
    spec,
    at: { x: (i % 3) * 4, y: Math.floor(i / 3) * 4, w: 4, h: 4 },
  }));
}

/** Buka dashboard sampai 10 query widget selesai dan tidak ada widget aria-busy. */
async function openDashboard(page, url, widgets) {
  let seen = 0;
  const onResponse = (r) => {
    if (r.url().endsWith("/api/query") && r.request().method() === "POST") seen++;
  };
  page.on("response", onResponse);
  const started = performance.now();
  await page.goto(url);
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const busy = await page.locator('[data-testid="widget"] [aria-busy="true"]').count();
    if (seen >= widgets && busy === 0) break;
    await sleep(100);
  }
  page.off("response", onResponse);
  return { ms: performance.now() - started, queries: seen };
}

/**
 * Dashboard 10 widget di atas dataset READY: buat → buka dingin → kolom filter → buka dengan filter →
 * p95 query per widget (nilai filter baru tiap putaran = dingin, lalu ulang = hangat).
 */
async function dashboardStage(context, page, a, datasetId, name) {
  await page.goto(`/dashboards/baru?dataset=${datasetId}`);
  await page.getByLabel("Nama dashboard").fill(name);
  await page.getByRole("button", { name: "Buat dashboard" }).click();
  await waitNav(page, /\/dashboards\/[a-z0-9]{20,32}\?mode=edit/, "buat-dashboard");
  const dashboardId = new URL(page.url()).pathname.split("/").pop();
  const sheets = await dashboardSources(context, dashboardId);
  if (!sheets.length) throw new Error("sumber sheet tidak terbaca dari halaman edit");
  log({
    ev: "sumber",
    sheets: sheets.map((s) => ({
      name: s.name,
      cols: s.columns.length,
      types: [...new Set(s.columns.map((c) => c.type))],
    })),
  });

  const plan = widgetPlan(sheets);
  let revision = 0;
  const widgetIds = [];
  const wStart = performance.now();
  for (const w of plan) {
    const r = await a.post(`/api/dashboards/${dashboardId}/widgets`, {
      baseRevision: revision,
      ...w,
    });
    if (r.status !== 200)
      throw new Error(`widget ${w.title}: ${r.status} ${JSON.stringify(r.body)}`);
    revision = r.body.data.layoutRevision;
    widgetIds.push(r.body.data.widget.id);
  }
  const widgetsMs = performance.now() - wStart;

  const view = `/dashboards/${dashboardId}`;
  const cold = await openDashboard(page, view, plan.length);
  log({ ev: "buka-dashboard", kondisi: "dingin", sec: sec(cold.ms), queries: cold.queries });
  const tDashboard = performance.now();

  // Filter dashboard: kolom teks pertama sheet 1, nilai dari slicer (seperti pengguna memilih).
  const s = sheets[0];
  const fcol = s.columns.find((c) => c.type === "text") ?? s.columns[0];
  const fc = await a.patch(`/api/dashboards/${dashboardId}/filter-columns`, {
    filterColumns: [{ sheet: s.name, column: fcol.name }],
  });
  if (fc.status !== 200) throw new Error(`filter-columns: ${fc.status} ${JSON.stringify(fc.body)}`);
  const fv = await a.post(`/api/dashboards/${dashboardId}/filter-values`, {
    column: fcol.name,
    sheet: s.name,
  });
  const values = ((fv.body?.data ?? fv.body)?.values ?? [])
    .map((v) => (typeof v === "object" && v !== null ? (v.value ?? v.label) : v))
    .filter((v) => v !== null && v !== undefined);
  if (values.length < QUERY_ROUNDS + 1)
    throw new Error(`nilai filter kurang: ${JSON.stringify(fv.body).slice(0, 300)}`);
  const filterOf = (v) => [{ column: fcol.name, op: "in", values: [v] }];

  const f = encodeURIComponent(JSON.stringify({ filters: filterOf(values[0]) }));
  const filtered = await openDashboard(page, `${view}?f=${f}`, plan.length);
  log({
    ev: "buka-dashboard",
    kondisi: "filter",
    sec: sec(filtered.ms),
    queries: filtered.queries,
  });
  const tTotal = performance.now();

  // p95 query per widget: nilai filter baru tiap putaran (dingin = cache hasil belum ada), lalu ulang
  // nilai yang sama (hangat = cache hasil).
  const coldMs = [];
  const warmMs = [];
  const errors = [];
  for (let r = 1; r <= QUERY_ROUNDS; r++) {
    for (const pass of [coldMs, warmMs]) {
      for (const widgetId of widgetIds) {
        const q = await a.post("/api/query", { widgetId, dashboardFilters: filterOf(values[r]) });
        if (q.status === 200) pass.push(q.ms);
        else errors.push(`${q.status} ${q.body?.code ?? ""}`);
      }
    }
  }
  return { widgetsMs, cold, filtered, tDashboard, tTotal, coldMs, warmMs, errors };
}

async function single(browser, path, userIndex) {
  const bytes = statSync(path).size;
  const context = await login(browser, USERS[userIndex]);
  const page = await context.newPage();
  const a = api(context);
  const t0 = performance.now();
  const name = `Perf ${basename(path)} ${RUN}`;
  const datasetId = await createDataset(page, name);
  try {
    await singleRun(context, page, a, path, bytes, datasetId, name, t0);
  } finally {
    // PERF_DELETE=1 (uji di produksi, T-1w0b): dataset uji dihapus lewat UI di akhir, juga saat galat atau
    // berhenti; hapus yang gagal dicatat tanpa menutupi galat aslinya.
    if (process.env.PERF_DELETE === "1")
      await deleteDataset(page, datasetId, name).then(
        () => log({ ev: "hapus", datasetId }),
        (e) => log({ ev: "hapus-gagal", datasetId, error: String(e) }),
      );
    await context.close();
  }
}

async function singleRun(context, page, a, path, bytes, datasetId, name, t0) {
  const uploadMs = await upload(page, path);
  log({
    ev: "unggah",
    file: basename(path),
    bytes,
    sec: sec(uploadMs),
    mbps: Math.round((bytes / 1e6 / (uploadMs / 1000)) * 8),
  });
  const ing = await waitIngest(a, datasetId);
  if (ing.status === "FAILED") throw new Error(`ingest gagal: ${ing.error}`);
  const tReady = performance.now();
  log({ ev: "siap", datasetId, detik: sec(tReady - t0), tahap: stageSeconds(ing.stages, tReady) });
  // Pemantau host (perf-tiers.sh) memicu STOP atau mati selama ingest → tahap dashboard tidak dijalankan.
  const stop = stopReason();
  if (stop) {
    log({ ev: "berhenti", sebelum: "dashboard", alasan: stop });
    return;
  }

  const { widgetsMs, cold, filtered, tDashboard, tTotal, coldMs, warmMs, errors } =
    await dashboardStage(context, page, a, datasetId, name);
  const summary = {
    ev: "ringkasan",
    mode: "single",
    file: basename(path),
    bytes,
    status: ing.status,
    sheets: ing.sheets?.map((x) => ({ name: x.name, rawRows: x.rawRows })),
    detik: {
      unggah: sec(uploadMs),
      antre:
        ing.marks.INGESTING && ing.marks.UPLOADED
          ? sec(ing.marks.INGESTING - ing.marks.UPLOADED)
          : null,
      ingest: ing.marks.INGESTING ? sec(tReady - ing.marks.INGESTING) : null,
      sampaiSiap: sec(tReady - t0),
      buatWidget: sec(widgetsMs),
      bukaDashboardDingin: sec(cold.ms),
      sampaiDashboard10Widget: sec(tDashboard - t0),
      bukaDashboardFilter: sec(filtered.ms),
      total: sec(tTotal - t0),
    },
    queryMs: { dingin: stats(coldMs), hangat: stats(warmMs), gagal: errors },
  };
  log(summary);
}

/** Hanya tahap dashboard di atas dataset READY yang sudah ada (ulang ukur tanpa unggah ulang). */
async function dashboardOnly(browser, datasetId, userIndex) {
  const context = await login(browser, USERS[userIndex]);
  const page = await context.newPage();
  const t0 = performance.now();
  const r = await dashboardStage(context, page, api(context), datasetId, `Perf ulang ${RUN}`);
  log({
    ev: "ringkasan",
    mode: "dashboard",
    datasetId,
    detik: {
      buatWidget: sec(r.widgetsMs),
      bukaDashboardDingin: sec(r.cold.ms),
      bukaDashboardFilter: sec(r.filtered.ms),
      total: sec(r.tTotal - t0),
    },
    queryMs: { dingin: stats(r.coldMs), hangat: stats(r.warmMs), gagal: r.errors },
  });
  await context.close();
}

async function concurrent(browser, path, n) {
  const contexts = await Promise.all(USERS.slice(0, n).map((u) => login(browser, u)));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const ids = [];
  for (const [i, p] of pages.entries())
    ids.push(await createDataset(p, `Perf antrean ${i + 1} ${RUN}`));
  const t0 = performance.now();
  const uploads = Promise.all(pages.map((p) => upload(p, path)));
  let maxIngesting = 0;
  const positions = new Set();
  let uiText = null;
  const done = new Set();
  const doneAt = [];
  while (done.size < n) {
    const st = await Promise.all(
      contexts.map((c, i) => api(c).get(`/api/datasets/${ids[i]}/progress`)),
    );
    const statuses = st.map((x) => x.body?.status ?? null);
    maxIngesting = Math.max(maxIngesting, statuses.filter((s) => s?.status === "INGESTING").length);
    for (const [i, s] of statuses.entries()) {
      if (s?.queue?.position) positions.add(s.queue.position);
      if (s && DONE.has(s.status) && !done.has(i)) {
        done.add(i);
        doneAt.push(sec(performance.now() - t0));
      }
      if (!uiText && s?.status === "UPLOADED" && s.queue) {
        const tx = await pages[i]
          .getByTestId("dataset-processing")
          .innerText()
          .catch(() => "");
        uiText = tx.match(/Menunggu giliran: antrean ke-[^.]*\./)?.[0] ?? null;
      }
    }
    log({
      ev: "tick",
      status: statuses.map((s) => s?.status ?? null),
      antrean: statuses.map((s) => s?.queue?.position ?? null),
    });
    await sleep(500);
  }
  await uploads;
  const summary = {
    ev: "ringkasan",
    mode: "concurrent",
    file: basename(path),
    akun: n,
    maksIngestBersamaan: maxIngesting,
    posisiAntreanTerlihat: [...positions].sort((x, y) => x - y),
    teksUi: uiText,
    selesaiDetik: doneAt,
  };
  log(summary);
  await Promise.all(contexts.map((c) => c.close()));
}

/** Hapus dataset lewat dialog UI (ketik nama), seperti pengguna; storage dibersihkan job aplikasi. */
async function deleteDataset(page, datasetId, name) {
  await page.goto(`/datasets/${datasetId}`);
  await page.getByRole("button", { name: "Hapus dataset" }).click();
  await page.getByLabel(`Ketik “${name}” untuk mengonfirmasi`).fill(name);
  await page.getByRole("button", { name: "Hapus permanen" }).click();
  await waitNav(page, /\/datasets\?deleted=1/, "hapus-dataset");
}

/**
 * Alasan berhenti dari pemantau host perf-tiers.sh: isi PERF_OUT/STOP, atau host.log yang tidak ditulis > 30 dtk
 * (pemantau mati); null = boleh lanjut. Tanpa PERF_OUT (dijalankan tanpa runner) selalu null.
 */
function stopReason() {
  if (!OUT) return null;
  if (existsSync(`${OUT}/STOP`)) return readFileSync(`${OUT}/STOP`, "utf8").trim();
  const beat = statSync(`${OUT}/host.log`, { throwIfNoEntry: false });
  return beat && Date.now() - beat.mtimeMs > 30_000
    ? "pemantau host tidak menulis host.log > 30 dtk"
    : null;
}

/** Detik per tahap ingest (jumlah per nama tahap; tahap baca berulang per sheet). */
function stageSeconds(stages, end) {
  const out = {};
  stages.forEach((s, i) => {
    out[s.tahap] = (out[s.tahap] ?? 0) + ((stages[i + 1]?.at ?? end) - s.at);
  });
  return Object.fromEntries(Object.entries(out).map(([k, ms]) => [k, sec(ms)]));
}

async function tiers(browser, paths) {
  const context = await login(browser, USERS[0]);
  const page = await context.newPage();
  const a = api(context);
  const rows = [];
  for (const path of paths) {
    const stop = stopReason();
    if (stop) {
      log({ ev: "berhenti", sebelum: basename(path), alasan: stop });
      break;
    }
    const bytes = statSync(path).size;
    const name = `Uji ${basename(path)} ${RUN}`;
    const t0 = performance.now();
    const datasetId = await createDataset(page, name);
    const uploadMs = await upload(page, path);
    const ing = await waitIngest(a, datasetId);
    const tReady = performance.now();
    const row = {
      file: basename(path),
      bytes,
      status: ing.status,
      baris: ing.sheets?.reduce((n, s) => n + (s.rawRows ?? 0), 0) ?? null,
      sheet: ing.sheets?.length ?? null,
      mbps: Math.round((bytes / 1e6 / (uploadMs / 1000)) * 8),
      detik: {
        unggah: sec(uploadMs),
        antre:
          ing.marks.INGESTING && ing.marks.UPLOADED
            ? sec(ing.marks.INGESTING - ing.marks.UPLOADED)
            : null,
        proses: ing.marks.INGESTING ? sec(tReady - ing.marks.INGESTING) : null,
        sampaiSiap: sec(tReady - t0),
      },
      tahap: stageSeconds(ing.stages, tReady),
      error: ing.error ?? null,
    };
    log({ ev: "jenjang", datasetId, ...row });
    rows.push(row);
    await deleteDataset(page, datasetId, name);
    log({ ev: "hapus", datasetId });
    if (ing.status === "FAILED") break;
    // Jeda antar jenjang: pembersihan storage dan pemanasan cache selesai dulu.
    await sleep(Number(process.env.PERF_PAUSE_S ?? 30) * 1000);
  }
  log({ ev: "ringkasan", mode: "tiers", jenjang: rows });
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  // Klien uji sekali pakai terhadap app sendiri; sandbox Chromium butuh profil seccomp renderer.
  chromiumSandbox: false,
  args: ["--disable-dev-shm-usage"],
});
try {
  if (mode === "single" && file) await single(browser, file, Number(arg ?? 0));
  else if (mode === "concurrent" && file) await concurrent(browser, file, Number(arg ?? 5));
  else if (mode === "dashboard" && file) await dashboardOnly(browser, file, Number(arg ?? 0));
  else if (mode === "tiers" && file) await tiers(browser, process.argv.slice(3));
  else
    throw new Error(
      "pakai: perf-e2e.mjs single <file> [akun] | concurrent <file> <n> | dashboard <datasetId> [akun] | tiers <file>...",
    );
} finally {
  await browser.close();
}
