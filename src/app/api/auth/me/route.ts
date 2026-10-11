import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

/** Identitas sesi saat ini; bukti bahwa Route Handler memakai requireUser() Node-side (sessionVersion dicek ke DB). */
export async function GET() {
  try {
    const user = await requireUser("action");
    return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, code: e.code }, { status: 401 });
    }
    throw e;
  }
}
