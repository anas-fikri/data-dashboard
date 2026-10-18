"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { currentAdmin, rateLimited } from "@/features/admin/guard";
import { clientIp } from "@/features/auth/rate-limit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import * as service from "./service";
import type { SmtpInput, SmtpResult, SmtpView } from "./types";

/*
 * Server Action Admin › Email (T-byys): admin aktif dari DB (selain itu NOT_FOUND, D2), rate limit per admin
 * — email uji juga, karena mengirim email dan menghubungi server dari isian — lalu service.
 */

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." } as const;

async function asAdmin<T>(
  action: string,
  run: (actor: { id: string; email: string }, ip: string) => Promise<SmtpResult<T>>,
): Promise<SmtpResult<T>> {
  try {
    const actor = await currentAdmin(action);
    if (!actor) return NOT_FOUND;
    return (
      (await rateLimited(actor.id)) ??
      (await run(actor, clientIp(await headers(), env().TRUST_PROXY)))
    );
  } catch (e) {
    unstable_rethrow(e);
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi SMTP gagal");
    return { ok: false, code: "BUSY", message: "Terjadi kesalahan. Coba lagi beberapa saat lagi." };
  }
}

export async function testSmtpAction(
  input: SmtpInput,
  to: string,
): Promise<SmtpResult<{ to: string }>> {
  return asAdmin("testSmtp", () => service.testSmtp(input, to));
}

export async function saveSmtpAction(input: SmtpInput): Promise<SmtpResult<SmtpView>> {
  return asAdmin("saveSmtp", async (actor, ip) => {
    const r = await service.saveSmtp(actor, input, ip);
    if (r.ok) revalidatePath("/admin/email");
    return r;
  });
}
