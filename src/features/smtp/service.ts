import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import { recordAudit } from "@/features/audit/service";
import { normalizeEmail } from "@/features/auth/email-domain";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  envSmtp,
  readSmtpFile,
  SMTP_SECURITY,
  smtpFile,
  transportOptions,
  type SmtpSettings,
  type StoredSmtp,
} from "@/lib/smtp-settings";
import { cleanLine } from "@/lib/text";
import type { SmtpField, SmtpResult, SmtpView } from "./types";

/*
 * Admin › Email (T-byys). Pemanggil WAJIB sudah lolos requireAdmin (halaman) atau currentAdmin (Server
 * Action). Password SMTP tidak pernah dikembalikan ke browser, dicatat di log, atau di audit.
 */

const email = (msg: string) =>
  z
    .string()
    .transform((v) => normalizeEmail(v) ?? "")
    .refine((v) => v !== "", msg);

const inputSchema = z.object({
  host: z
    .string()
    .trim()
    .regex(
      /^(?=.{1,253}$)[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*$/,
      "Isi nama server SMTP, mis. mail.pcpexpress.com.",
    ),
  port: z.coerce
    .number({ message: "Port harus angka." })
    .int("Port harus angka.")
    .min(1, "Port 1–65535.")
    .max(65535, "Port 1–65535."),
  security: z.enum(SMTP_SECURITY),
  username: z
    .string()
    .trim()
    .regex(/^[\x21-\x7e]{0,254}$/, "Username tanpa spasi, maksimal 254 karakter."),
  password: z
    .string()
    .max(256, "Password maksimal 256 karakter.")
    .regex(/^[\x20-\x7e]*$/, "Password hanya karakter ASCII tanpa baris baru."),
  fromAddress: email("Isi email pengirim yang valid."),
  fromName: z.string().transform((v) => cleanLine(v, 80) ?? ""),
});

type Parsed = { settings: SmtpSettings; passwordChanged: boolean };

/** Isian tervalidasi + password yang berlaku bila kolom password dikosongkan. */
function parse(raw: unknown): SmtpResult<Parsed> {
  const r = inputSchema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      code: "INVALID",
      message: issue?.message ?? "Isian tidak valid.",
      field: typeof field === "string" ? (field as SmtpField) : undefined,
    };
  }
  const typed = r.data.password;
  const current = readSmtpFile() ?? envSmtp();
  // Password yang berlaku hanya dipakai ulang untuk server + akun yang sama dan tanpa turun ke teks polos:
  // admin (atau sesi yang dibajak) tidak bisa mengarahkannya ke server lain lewat "Kirim email uji".
  const sameServer =
    r.data.host.toLowerCase() === current.host.toLowerCase() &&
    r.data.port === current.port &&
    r.data.username === current.username &&
    (r.data.security !== "none" || current.security === "none");
  if (!typed && current.password && !sameServer) {
    return {
      ok: false,
      code: "INVALID",
      message: "Server, port, keamanan, atau username berubah — isi password lagi.",
      field: "password",
    };
  }
  return {
    ok: true,
    data: {
      settings: { ...r.data, password: typed || current.password },
      passwordChanged: !!typed,
    },
  };
}

export function getSmtpPage(): SmtpView {
  const file = readSmtpFile();
  const s = file ?? envSmtp();
  return {
    source: file ? "app" : "env",
    host: s.host,
    port: s.port,
    security: s.security,
    username: s.username,
    hasPassword: s.password.length > 0,
    fromAddress: s.fromAddress,
    fromName: s.fromName,
    updatedAt: file?.updatedAt ?? null,
    updatedBy: file?.updatedBy ?? null,
  };
}

/** Pesan yang bisa ditindak dari galat nodemailer (tanpa isi kredensial). */
export function smtpMessage(e: unknown): string {
  const err = e as { code?: string; message?: string; response?: string };
  const code = err.code ?? "";
  const text = `${err.message ?? ""}`;
  if (code === "EAUTH") return "Username atau password ditolak server SMTP.";
  if (/SSL|TLS|wrong version|certificate/i.test(text) || code === "ETLS") {
    return "Jabat tangan TLS gagal. Port 465 memakai SSL/TLS, port 587 memakai STARTTLS.";
  }
  if (["ECONNECTION", "ETIMEDOUT", "EDNS", "ESOCKET", "ECONNREFUSED", "ENOTFOUND"].includes(code)) {
    return "Tidak bisa terhubung ke server SMTP. Periksa host, port, dan jaringan.";
  }
  if (code === "EENVELOPE") {
    return `Server menolak alamat pengirim atau tujuan${err.response ? `: ${err.response.slice(0, 200)}` : "."}`;
  }
  return `Gagal mengirim (${code || "galat tidak dikenal"}).`;
}

/** Kirim email uji dengan isian saat ini (belum perlu disimpan). */
export async function testSmtp(
  actor: { id: string },
  raw: unknown,
  toRaw: unknown,
  ip: string,
): Promise<SmtpResult<{ to: string }>> {
  const p = parse(raw);
  if (!p.ok) return p;
  const to = normalizeEmail(toRaw);
  if (!to)
    return { ok: false, code: "INVALID", message: "Isi email tujuan yang valid.", field: "testTo" };
  const s = p.data.settings;
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "smtp.settings.test",
    targetType: "system",
    targetId: "smtp",
    meta: { host: s.host, port: s.port, security: s.security, to },
    ip,
  });
  const t = nodemailer.createTransport(transportOptions(s));
  try {
    await t.sendMail({
      from: { name: s.fromName, address: s.fromAddress },
      to,
      subject: "Email uji Data Dashboard",
      text: "Pengaturan SMTP Data Dashboard berhasil mengirim email ini. Tidak perlu dibalas.",
    });
    return { ok: true, data: { to } };
  } catch (e) {
    logger.warn({ code: (e as { code?: string }).code }, "email uji SMTP gagal");
    return { ok: false, code: "UNAVAILABLE", message: smtpMessage(e) };
  } finally {
    t.close();
  }
}

export async function saveSmtp(
  actor: { id: string; email: string },
  raw: unknown,
  ip: string,
): Promise<SmtpResult<SmtpView>> {
  const p = parse(raw);
  if (!p.ok) return p;
  const stored: StoredSmtp = {
    ...p.data.settings,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email,
  };
  try {
    const file = smtpFile();
    await mkdir(dirname(file), { recursive: true });
    const tmp = join(dirname(file), `.smtp.${randomUUID()}.tmp`);
    await writeFile(tmp, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
    await rename(tmp, file);
  } catch (e) {
    logger.error(
      { actorId: actor.id, err: (e as NodeJS.ErrnoException).code ?? String(e) },
      "pengaturan SMTP tidak bisa ditulis",
    );
    return {
      ok: false,
      code: "UNAVAILABLE",
      message:
        "Pengaturan tidak bisa disimpan: folder konfigurasi di server tidak bisa ditulis. Hubungi pengelola server.",
    };
  }
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "smtp.settings.update",
    targetType: "system",
    targetId: "smtp",
    meta: {
      host: stored.host,
      port: stored.port,
      security: stored.security,
      username: stored.username,
      fromAddress: stored.fromAddress,
      passwordChanged: p.data.passwordChanged,
    },
    ip,
  });
  logger.info({ actorId: actor.id, host: stored.host }, "pengaturan SMTP diubah");
  return { ok: true, data: getSmtpPage() };
}
