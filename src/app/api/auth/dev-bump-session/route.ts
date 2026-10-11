import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/features/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Hanya untuk e2e: menaikkan sessionVersion MILIK PEMANGGIL (butuh sesi) agar pencabutan sesi
 * (D1) bisa diuji. Aktif hanya bila NODE_ENV bukan production DAN E2E_ENDPOINTS=1; selain itu 404.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production" || process.env.E2E_ENDPOINTS !== "1") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }
  try {
    const user = await requireUser("action");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    return NextResponse.json({ ok: true, sessionVersion: updated.sessionVersion });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, code: e.code }, { status: 401 });
    }
    throw e;
  }
}
