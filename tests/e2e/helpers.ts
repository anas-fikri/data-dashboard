import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8026";
export const PASSWORD = "dummy-kalimat-panjang-uji-123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pcpexpress.com`;
}

/** Semua tautan aktivasi untuk email ini, terbaru dulu (email dikirim di latar, jadi polling). */
export async function verifyLinksFor(
  request: APIRequestContext,
  email: string,
  atLeast = 1,
): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const body = (await res.json()) as {
      messages?: { ID: string; Subject: string; Created: string }[];
    };
    const msgs = (body.messages ?? [])
      .filter((m) => m.Subject.includes("Aktifkan"))
      .sort((a, b) => b.Created.localeCompare(a.Created));
    if (msgs.length >= atLeast) {
      const links: string[] = [];
      for (const m of msgs) {
        const detail = (await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
          Text: string;
        };
        const link = detail.Text.match(/https?:\/\/\S+\/verify\?token=[A-Za-z0-9_-]+/)?.[0];
        if (link) links.push(link);
      }
      if (links.length >= atLeast) return links;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`email verifikasi untuk ${email} tidak ditemukan di Mailpit`);
}

interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Semua email untuk alamat ini yang subjeknya mengandung `subject`, terbaru dulu. */
export async function mailsFor(
  request: APIRequestContext,
  email: string,
  subject: string,
): Promise<MailSummary[]> {
  const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
  const body = (await res.json()) as { messages?: MailSummary[] };
  return (body.messages ?? [])
    .filter((m) => m.Subject.includes(subject))
    .sort((a, b) => b.Created.localeCompare(a.Created));
}

/** Tautan atur ulang password terbaru untuk email ini. */
export async function resetLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [latest] = await mailsFor(request, email, "Atur ulang password");
    if (latest) {
      const detail = (await (
        await request.get(`${MAILPIT}/api/v1/message/${latest.ID}`)
      ).json()) as { Text: string };
      const link = detail.Text.match(/https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`email reset untuk ${email} tidak ditemukan di Mailpit`);
}

export async function requestReset(page: Page, email: string) {
  await page.goto("/lupa-password");
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByRole("button", { name: "Kirim tautan atur ulang" }).click();
}

export async function verifyLinkFor(request: APIRequestContext, email: string): Promise<string> {
  return (await verifyLinksFor(request, email))[0]!;
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByLabel("Nama").fill("Uji E2E");
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Periksa inbox Anda");
}

/** Buka tautan dari email, isi password pendaftaran, tekan "Aktifkan akun" (POST). */
export async function activate(page: Page, link: string, password = PASSWORD) {
  await page.goto(link);
  await page.getByLabel("Password yang Anda buat saat mendaftar").fill(password);
  await page.getByRole("button", { name: "Aktifkan akun" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1/);
}

export async function registerAndVerify(page: Page, request: APIRequestContext, email: string) {
  await register(page, email);
  await activate(page, await verifyLinkFor(request, email));
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email perusahaan").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

/** Login lewat route JSON; cookie sesi tersimpan di konteks browser halaman. */
export async function apiLogin(page: Page, email: string, password = PASSWORD) {
  const res = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), await res.text()).toBe(200);
}

/** Satu konteks browser (cookie terpisah) per pengguna, sudah login; tutup lewat page.context(). */
export async function pageFor(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await apiLogin(page, email);
  return page;
}

/** Log worker per spec; ditimpa tiap run dan tidak dihapus global-teardown (bahan debug flake). */
export function workerLogPath(name: string): string {
  return join(tmpdir(), `dd-e2e-worker-${name}.log`);
}

/**
 * Worker ingest sungguhan (`npm run worker`) di grup prosesnya sendiri (npm → tsx → node) agar
 * stopWorker bisa mematikan semuanya. stdout DAN stderr selalu dikuras ke workerLogPath(name): pipe
 * yang tidak dibaca bisa penuh dan membuat worker macet. Selesai saat log "worker berjalan" (≤ 60 s).
 * `env`: variabel tambahan untuk worker ini saja (mis. EXPORT_MAX_ROWS kecil); menang atas .env karena
 * --env-file tidak menimpa variabel yang sudah ada.
 */
export function startWorker(name: string, env: Record<string, string> = {}): Promise<ChildProcess> {
  return startNpmScript("worker", workerLogPath(name), "worker berjalan", env);
}

/** Nilai satu variabel dari .env lokal (process.env menang, seperti --env-file). Jangan dicetak. */
export function envFileValue(name: string): string | undefined {
  if (process.env[name] !== undefined) return process.env[name];
  if (!existsSync(".env")) return undefined;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m?.[1] === name) return m[2]!.replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

/** Renderer PDF dev (T-018): RENDERER_URL dari .env, bawaan port 3200. */
export const RENDERER_URL = (envFileValue("RENDERER_URL") ?? "http://127.0.0.1:3200").replace(
  /\/+$/,
  "",
);

/**
 * Renderer PDF sungguhan (`npm run renderer`, T-018) di grup prosesnya sendiri (npm → tsx → node →
 * Chromium) — log di workerLogPath(`renderer-<name>`), siap saat log "renderer berjalan" lalu
 * GET /healthz 200 (Chromium tersambung). ALLOW_DEV_WEBSOCKET=true: app berjalan di `next dev` (klien
 * HMR membuka WebSocket same-origin; tanpa ini halaman render tidak pernah tenang). Matikan dengan
 * stopRenderer (SIGTERM ke grup: job berjalan ditunggu, Chromium ikut ditutup; SIGKILL setelah 15 s).
 */
export async function startRenderer(
  name: string,
  env: Record<string, string> = {},
): Promise<ChildProcess> {
  const r = await startNpmScript(
    "renderer",
    workerLogPath(`renderer-${name}`),
    "renderer berjalan",
    { ALLOW_DEV_WEBSOCKET: "true", ...env },
  );
  try {
    const res = await fetch(`${RENDERER_URL}/healthz`, { signal: AbortSignal.timeout(5_000) });
    if (res.status !== 200) throw new Error(`renderer /healthz ${res.status}`);
  } catch (e) {
    await stopRenderer(r);
    throw e;
  }
  return r;
}

/**
 * SIGTERM ke grup renderer lalu tunggu SAMPAI GRUPNYA HABIS (≤ 15 s; lalu SIGKILL): npm bisa keluar
 * lebih dulu daripada node renderer yang masih menutup Chromium (Chromium di grupnya sendiri — ditutup
 * renderer saat SIGTERM, jadi SIGKILL hanya jalan terakhir). Sesudahnya port renderer bebas: uji
 * "renderer mati" benar-benar tanpa renderer, dan startRenderer berikutnya tidak bentrok port.
 */
export async function stopRenderer(r: ChildProcess | null | undefined): Promise<void> {
  if (!r?.pid) return;
  const group = -r.pid;
  const signal = (s: NodeJS.Signals | 0) => {
    try {
      process.kill(group, s);
      return true;
    } catch {
      return false; // grup sudah tidak ada
    }
  };
  const gone = async (ms: number) => {
    for (const until = Date.now() + ms; Date.now() < until;) {
      if (!signal(0)) return true;
      await new Promise((res) => setTimeout(res, 200));
    }
    return !signal(0);
  };
  if (!signal("SIGTERM")) return;
  if (await gone(15_000)) return;
  signal("SIGKILL");
  if (!(await gone(5_000))) throw new Error(`grup renderer ${r.pid} tidak berhenti`);
}

async function startNpmScript(
  script: string,
  logPath: string,
  ready: string,
  env: Record<string, string>,
): Promise<ChildProcess> {
  const log = createWriteStream(logPath);
  const w = spawn("npm", ["run", script], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
    detached: true,
  });
  w.stdout!.pipe(log, { end: false });
  w.stderr!.pipe(log, { end: false });
  w.once("close", () => log.end());
  // Grup terpisah (detached) tidak ikut mati bersama runner: bila tes timeout sebelum `worker` di-set,
  // afterAll tidak mengenalnya — matikan paksa saat proses runner keluar.
  const killGroup = () => {
    try {
      process.kill(-w.pid!, "SIGKILL");
    } catch {
      /* sudah berhenti */
    }
  };
  process.once("exit", killGroup);
  w.once("exit", () => process.off("exit", killGroup));
  try {
    await new Promise<void>((resolve, reject) => {
      let seen = "";
      const t = setTimeout(() => reject(new Error(`${script} tidak siap dalam 60 s`)), 60_000);
      w.stdout!.on("data", (d: Buffer) => {
        // Sisa potongan sebelumnya ikut diperiksa: penanda bisa terbelah di batas chunk.
        seen = (seen + d.toString()).slice(-4096);
        if (seen.includes(ready)) {
          clearTimeout(t);
          resolve();
        }
      });
      w.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
      w.once("exit", (code) => {
        clearTimeout(t);
        reject(new Error(`${script} keluar (${code}); lihat ${logPath}`));
      });
    });
  } catch (e) {
    await stopWorker(w);
    throw e;
  }
  return w;
}

/** SIGTERM ke seluruh grup (shutdown rapi menunggu job aktif), SIGKILL bila belum keluar dalam 15 s. */
export async function stopWorker(w: ChildProcess | null | undefined): Promise<void> {
  if (!w?.pid || w.exitCode !== null || w.signalCode !== null) return;
  const pid = w.pid;
  const exited = new Promise<"exit">((r) => w.once("exit", () => r("exit")));
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return; // grup sudah tidak ada
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((r) => {
    timer = setTimeout(() => r("timeout"), 15_000);
  });
  const result = await Promise.race([exited, timeout]);
  clearTimeout(timer);
  if (result === "timeout") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* sudah berhenti */
    }
  }
}
