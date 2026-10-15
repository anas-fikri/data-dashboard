import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import {
  exchangeRenderToken,
  redisRenderStore,
  renderCookie,
  type RenderTokenStore,
} from "./render-token";

/*
 * GET /render/<token> (T-018, D4): satu-satunya pintu masuk renderer. Token sah (sekali pakai, ≤ 60
 * detik) → 303 Location /render + Set-Cookie dd.render (Path=/render, HttpOnly, SameSite=Strict, Max-Age
 * ≤ 60): token pindah dari URL ke cookie pada respons pertama. Apa pun yang salah — bentuk, dipakai
 * ulang, kedaluwarsa, Redis mati — → 404 polos tanpa body (AC2). Path (berisi token) tidak pernah dicatat.
 */

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

const notFound = () => new NextResponse(null, { status: 404, headers: HEADERS });

export interface RenderExchangeDeps {
  store(): Promise<RenderTokenStore>;
  /** APP_INTERNAL_URL: Secure cookie hanya bila https. */
  internalUrl?: string;
  now?: () => number;
  log?: (err: string) => void;
}

export async function renderExchange(
  token: string,
  deps: RenderExchangeDeps,
): Promise<NextResponse> {
  try {
    const r = await exchangeRenderToken(await deps.store(), token, deps.now?.());
    if (!r) return notFound();
    const res = new NextResponse(null, {
      status: 303,
      headers: { ...HEADERS, Location: "/render" },
    });
    const c = renderCookie(r.sessionId, r.maxAgeSec, deps.internalUrl);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (e) {
    deps.log?.(e instanceof Error ? e.message : String(e));
    return notFound();
  }
}

/** Perakitan produksi (Route Handler src/app/render/[token]/route.ts). */
export function renderTokenRoute(token: string): Promise<NextResponse> {
  return renderExchange(token, {
    store: async () => redisRenderStore(await redisReady()),
    internalUrl: env().APP_INTERNAL_URL,
    log: (err) => logger.error({ err }, "tukar token render gagal"),
  });
}
