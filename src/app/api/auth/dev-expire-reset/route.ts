import { NextResponse } from "next/server";
import { normalizeEmail } from "@/features/auth/email-domain";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Hanya untuk e2e: memajukan kedaluwarsa token reset milik email tertentu agar aturan
 * "kedaluwarsa 30 menit" bisa diuji tanpa menunggu. Aktif hanya bila NODE_ENV bukan
 * production DAN E2E_ENDPOINTS=1; selain itu 404. Tidak membocorkan apa pun (selalu 200).
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.E2E_ENDPOINTS !== "1") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = normalizeEmail(body.email);
  if (email) {
    await prisma.verificationToken.updateMany({
      where: { purpose: "RESET_PASSWORD", usedAt: null, user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
  }
  return NextResponse.json({ ok: true });
}
