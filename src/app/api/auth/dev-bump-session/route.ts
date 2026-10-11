import { NextResponse } from "next/server";
import { normalizeEmail } from "@/features/auth/email-domain";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Hanya untuk e2e di lingkungan non-produksi: menaikkan sessionVersion user agar
 * pencabutan sesi (D1) bisa diuji tanpa menyentuh DB langsung. Di produksi → 404.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ ok: false, code: "INVALID_EMAIL" }, { status: 400 });
  const user = await prisma.user.update({
    where: { email },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return NextResponse.json({ ok: true, sessionVersion: user.sessionVersion });
}
