import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { hit, RULES } from "@/features/auth/rate-limit";
import { json, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
import { redisReady } from "@/lib/redis";
import { WIDGET_TITLE_MAX, cleanName } from "./validation";
import {
  addWidget,
  configureWidget,
  deleteWidget,
  detachWidget,
  renameWidget,
  saveLayout,
  setDashboardFilterColumns,
  type DashboardCode,
  type DashboardResult,
} from "./service";

/*
 * HTTP kanvas dashboard (T-010): tambah/hapus/ganti judul widget dan simpan otomatis tata letak. Semua
 * mutasi: Origin wajib = APP_URL, body JSON ≤ 64 KB, rate limit per user (simpan otomatis tiap
 * geser/ubah ukuran, jadi batasnya longgar tetapi tetap ada). T-016: tanpa akses ke dashboard → 404;
 * bisa melihat tetapi tidak boleh mengubah (viewer; editor pada kolom filter) → 403 FORBIDDEN.
 */

const STATUS: Record<DashboardCode, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
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

/**
 * PATCH widget: { title } ganti judul, atau { type, spec } atur isi widget (T-011). `version` opsional
 * (review T-016 DI-1): versi pengaturan yang dilihat klien; sudah berganti → 409 STALE. Sukses membawa
 * `version` baru. T-073: { type, spec, savedPivotId } ikat ke pivot tersimpan (spec = tampilan);
 * { detach: true } lepas dari sumber (spec efektif disalin ke widget).
 */
export const updateWidgetRoute = (req: NextRequest, dashboardId: string, widgetId: string) =>
  mutation(req, "ubah widget gagal", async (userId, body) => {
    const b = (body && typeof body === "object" ? body : {}) as {
      title?: unknown;
      type?: unknown;
      spec?: unknown;
      version?: unknown;
      savedPivotId?: unknown;
      detach?: unknown;
    };
    if (b.detach !== undefined) {
      if (b.detach !== true || b.type !== undefined || b.title !== undefined) {
        return json({ ok: false, code: "INVALID", message: "Permintaan tidak valid." }, 400);
      }
      return reply(await detachWidget(userId, dashboardId, widgetId, b.version));
    }
    if (b.type === undefined)
      return reply(await renameWidget(userId, dashboardId, widgetId, b.title, b.version));
    // Keduanya dikirim: judul diperiksa dulu, isi disimpan, lalu judul — tidak ada bagian yang
    // tersimpan bila yang lain ditolak validasi (review keamanan T-011).
    if (b.title !== undefined && b.title !== "") {
      const t = cleanName(b.title, WIDGET_TITLE_MAX, "widget");
      if (!t.ok)
        return json({ ok: false, code: "INVALID", message: t.message, field: "name" }, 400);
    }
    const configured = await configureWidget(
      userId,
      dashboardId,
      widgetId,
      b.type,
      b.spec,
      b.version,
      b.savedPivotId,
    );
    if (!configured.ok || b.title === undefined) return reply(configured);
    // Judul di atas versi yang baru saja ditulis (CAS berantai bila klien mengirim versi).
    const next = b.version === undefined ? undefined : configured.data.version;
    return reply(await renameWidget(userId, dashboardId, widgetId, b.title, next));
  });

export const saveLayoutRoute = (req: NextRequest, dashboardId: string) =>
  mutation(req, "simpan tata letak gagal", async (userId, body) =>
    reply(await saveLayout(userId, dashboardId, body)),
  );

/**
 * PATCH { filterColumns: [{ sheet, column }] } — kolom filter global dashboard (T-012), pemilik saja
 * (editor/viewer → 403).
 */
export const setFilterColumnsRoute = (req: NextRequest, dashboardId: string) =>
  mutation(req, "simpan kolom filter gagal", async (userId, body) => {
    const b = (body && typeof body === "object" ? body : {}) as { filterColumns?: unknown };
    return reply(await setDashboardFilterColumns(userId, dashboardId, b.filterColumns));
  });
