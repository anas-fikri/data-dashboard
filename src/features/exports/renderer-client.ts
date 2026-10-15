/*
 * Klien renderer PDF (T-018, D1/D12). Renderer hanya menerima { token } + header x-renderer-secret,
 * tidak pernah URL (AC5); ia membuka APP_INTERNAL_URL/render/<token> sendiri.
 *  - health(): GET <RENDERER_URL>/healthz ≤ 3 detik — dipakai app saat buat (503 RENDERER_UNAVAILABLE
 *    langsung, AC3) dan worker sebelum POST /render.
 *  - render(): POST <RENDERER_URL>/render dengan batas waktu RENDER_TIMEOUT_MS (minta + baca PDF) dan
 *    batas ukuran PDF_MAX_BYTES saat membaca (tidak pernah menampung lebih dari batas di memori).
 * Pemetaan: tidak dikonfigurasi/tidak bisa dihubungi → RENDERER_UNAVAILABLE; 503 (renderer penuh) →
 * RENDERER_UNAVAILABLE + busy (worker mengulang); waktu habis atau 504/408 → EXPORT_TIMEOUT; lebih dari
 * batas → EXPORT_TOO_LARGE; jawaban lain → EXPORT_FAILED. `detail` hanya untuk log (tanpa token/secret).
 * fetch diinjeksi (uji tanpa jaringan).
 */
import { EXPORT_CODES } from "./types";

export const HEALTH_TIMEOUT_MS = 3_000;

export interface RendererConfig {
  url?: string;
  secret?: string;
  fetch?: typeof fetch;
}

export type RenderFailureCode =
  | typeof EXPORT_CODES.RENDERER_UNAVAILABLE
  | typeof EXPORT_CODES.EXPORT_TIMEOUT
  | typeof EXPORT_CODES.EXPORT_TOO_LARGE
  | typeof EXPORT_CODES.EXPORT_FAILED;

export type RenderResult =
  | { ok: true; pdf: Uint8Array }
  | { ok: false; code: RenderFailureCode; busy?: boolean; detail: string };

export interface RendererClient {
  /** RENDERER_URL dan RENDERER_SECRET terisi. */
  configured: boolean;
  /** Renderer hidup (200 dari /healthz) dalam `timeoutMs`; galat apa pun → false. */
  health(timeoutMs?: number): Promise<boolean>;
  render(
    token: string,
    opts: { timeoutMs: number; maxBytes: number; signal?: AbortSignal },
  ): Promise<RenderResult>;
}

const fail = (
  code: RenderFailureCode,
  detail: string,
  busy = false,
): Extract<RenderResult, { ok: false }> => ({ ok: false, code, detail, ...(busy ? { busy } : {}) });

/**
 * Body dibaca sampai `max` byte; lebih → null (sisa stream dibatalkan). `signal` batal → stream
 * dibatalkan dan galat dilempar (PDF terpotong tidak pernah dianggap utuh).
 */
async function readCapped(
  res: Response,
  max: number,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      if (signal.aborted) throw new Error("pembacaan PDF dibatalkan");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    if (signal.aborted) throw new Error("pembacaan PDF dibatalkan");
    return Buffer.concat(chunks, total);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function rendererClient(cfg: RendererConfig): RendererClient {
  const doFetch = cfg.fetch ?? fetch;
  const base = cfg.url?.replace(/\/+$/, "");
  const secret = cfg.secret;
  return {
    configured: !!(base && secret),

    async health(timeoutMs = HEALTH_TIMEOUT_MS) {
      if (!base || !secret) return false;
      try {
        const res = await doFetch(`${base}/healthz`, {
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
          cache: "no-store",
        });
        await res.body?.cancel().catch(() => {});
        return res.status === 200;
      } catch {
        return false;
      }
    },

    async render(token, { timeoutMs, maxBytes, signal }) {
      if (!base || !secret) return fail("RENDERER_UNAVAILABLE", "renderer tidak dikonfigurasi");
      const timeout = AbortSignal.timeout(timeoutMs);
      const sig = signal ? AbortSignal.any([timeout, signal]) : timeout;
      const timedOut = () => timeout.aborted || !!signal?.aborted;
      let res: Response;
      try {
        res = await doFetch(`${base}/render`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-renderer-secret": secret },
          body: JSON.stringify({ token }),
          signal: sig,
          redirect: "error",
          cache: "no-store",
        });
      } catch (e) {
        if (timedOut()) return fail("EXPORT_TIMEOUT", `renderer tidak menjawab ${timeoutMs} ms`);
        const cause = (e as { cause?: { code?: string } }).cause?.code;
        return fail(
          "RENDERER_UNAVAILABLE",
          `renderer tidak bisa dihubungi${cause ? ` (${cause})` : ""}`,
        );
      }
      if (res.status !== 200) {
        await res.body?.cancel().catch(() => {});
        if (res.status === 503) return fail("RENDERER_UNAVAILABLE", "renderer penuh (503)", true);
        if (res.status === 504 || res.status === 408) {
          return fail("EXPORT_TIMEOUT", `renderer: halaman tidak siap (${res.status})`);
        }
        return fail("EXPORT_FAILED", `renderer menjawab ${res.status}`);
      }
      const type = res.headers.get("content-type") ?? "";
      if (!type.toLowerCase().startsWith("application/pdf")) {
        await res.body?.cancel().catch(() => {});
        return fail("EXPORT_FAILED", "renderer menjawab bukan application/pdf");
      }
      try {
        const pdf = await readCapped(res, maxBytes, sig);
        if (!pdf) return fail("EXPORT_TOO_LARGE", `PDF melebihi ${maxBytes} byte`);
        return { ok: true, pdf };
      } catch {
        if (timedOut())
          return fail("EXPORT_TIMEOUT", `PDF tidak selesai dibaca dalam ${timeoutMs} ms`);
        return fail("EXPORT_FAILED", "PDF terputus saat dibaca");
      }
    },
  };
}
