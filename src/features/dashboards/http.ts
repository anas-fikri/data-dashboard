import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { hit, RULES } from "@/features/auth/rate-limit";
import { json, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
import { redisReady } from "@/lib/redis";
import {
  addWidget,
  configureWidget,
  deleteWidget,
  renameWidget,
  saveLayout,
  type DashboardCode,
  type DashboardResult,
} from "./service";

/*
 * HTTP kanvas dashboard (T-010): tambah/hapus/ganti judul widget dan simpan otomatis tata letak. Semua
 * mutasi: Origin wajib = APP_URL, body JSON ≤ 64 KB, rate limit per user (simpan otomatis tiap
 * geser/ubah ukuran, jadi batasnya longgar tetapi tetap ada).
 */

const STATUS: Record<DashboardCode, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  LIMIT_REACHED: 409,
  NAME_TAKEN: 409,
  STALE: 409,
  BUSY: 409,
};
const BODY_MAX = 64 * 1024;

const reply = <T>(r: DashboardResult<T>) => (r.ok ? json(r) : json(r, STATUS[r.code]));

/** DELETE tanpa body: revisi yang dilihat klien dikirim lewat ?baseRevision=N. */
function revisionParam(req: NextRequest): number | null {
  const raw = req.nextUrl.searchParams.get("baseRevision");
  return raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

function mutation(
  req: NextRequest,
  label: string,
  fn: (userId: string, body: unknown) => Promise<NextResponse>,
  withBody = true,
): Promise<NextResponse> {
  const cross = rejectCrossOrigin(req);
  if (cross) return Promise.resolve(cross);
  return withUser(label, async (userId) => {
    const rl = await hit(await redisReady(), RULES.dashboardEdit, userId);
    if (!rl.allowed) {
      return json(
        {
          ok: false,
          code: "RATE_LIMITED",
          message: `Terlalu banyak perubahan. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
        },
        429,
        { "Retry-After": String(rl.retryAfterSec) },
      );
    }
    if (!withBody) return fn(userId, null);
    const read = await readJson(req, BODY_MAX);
    if ("response" in read) return read.response;
    return fn(userId, read.body);
  });
}

export const addWidgetRoute = (req: NextRequest, dashboardId: string) =>
  mutation(req, "tambah widget gagal", async (userId, body) =>
    reply(await addWidget(userId, dashboardId, body)),
  );

export const deleteWidgetRoute = (req: NextRequest, dashboardId: string, widgetId: string) =>
  mutation(
    req,
    "hapus widget gagal",
    async (userId) => reply(await deleteWidget(userId, dashboardId, widgetId, revisionParam(req))),
    false,
  );

/** PATCH widget: { title } ganti judul, atau { type, spec } atur isi widget (T-011). */
export const updateWidgetRoute = (req: NextRequest, dashboardId: string, widgetId: string) =>
  mutation(req, "ubah widget gagal", async (userId, body) => {
    const b = (body && typeof body === "object" ? body : {}) as {
      title?: unknown;
      type?: unknown;
      spec?: unknown;
    };
    if (b.type === undefined)
      return reply(await renameWidget(userId, dashboardId, widgetId, b.title));
    // Keduanya dikirim: judul lalu isi (tidak ada bagian yang diam-diam diabaikan).
    if (b.title !== undefined) {
      const renamed = await renameWidget(userId, dashboardId, widgetId, b.title);
      if (!renamed.ok) return reply(renamed);
    }
    return reply(await configureWidget(userId, dashboardId, widgetId, b.type, b.spec));
  });

export const saveLayoutRoute = (req: NextRequest, dashboardId: string) =>
  mutation(req, "simpan tata letak gagal", async (userId, body) =>
    reply(await saveLayout(userId, dashboardId, body)),
  );
