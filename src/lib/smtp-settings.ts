import { readFileSync } from "node:fs";
import { join } from "node:path";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { z } from "zod";
import { sharedConfigDir } from "./config-dir";
import { env } from "./env";

/*
 * Pengaturan SMTP (T-byys): dari Admin › Email (app/smtp.json, 600, di volume bersama — dibaca juga
 * deploy/backup.sh untuk email notifikasi) atau bawaan server (SMTP_URL + MAIL_FROM di .env).
 * Password hanya ada di file itu / .env; tidak di DB, log, atau audit.
 */

export const SMTP_SECURITY = ["ssl", "starttls", "none"] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY)[number];

export interface SmtpSettings {
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

const storedSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  security: z.enum(SMTP_SECURITY),
  username: z.string(),
  password: z.string(),
  fromAddress: z.string().min(3),
  fromName: z.string(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});
export type StoredSmtp = z.infer<typeof storedSchema>;

export const smtpFile = (): string => join(sharedConfigDir(), "app", "smtp.json");

/** Pengaturan dari Admin › Email; belum ada atau rusak → null (bawaan server dipakai). */
export function readSmtpFile(): StoredSmtp | null {
  try {
    const r = storedSchema.safeParse(JSON.parse(readFileSync(smtpFile(), "utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** "Data Dashboard <a@b>" → nama + alamat; tanpa <> → alamat saja. */
export function parseFrom(raw: string): { fromName: string; fromAddress: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  return m
    ? { fromName: m[1]!.trim(), fromAddress: m[2]!.trim() }
    : { fromName: "", fromAddress: raw.trim() };
}

/** Bawaan server dari SMTP_URL + MAIL_FROM (.env); keamanan disimpulkan dari skema dan port. */
export function envSmtp(): SmtpSettings {
  const u = new URL(env().SMTP_URL);
  const ssl = u.protocol === "smtps:";
  const port = Number(u.port) || (ssl ? 465 : 587);
  return {
    host: u.hostname,
    port,
    // smtp:// ke server sungguhan = STARTTLS; teks polos hanya untuk relay lokal (Mailpit dev).
    security: ssl ? "ssl" : /^(localhost|127\.0\.0\.1|::1)$/.test(u.hostname) ? "none" : "starttls",
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ...parseFrom(env().MAIL_FROM),
  };
}

/** Opsi transport nodemailer; timeout pendek agar SMTP lambat tidak menggantung tugas latar. */
export function transportOptions(s: SmtpSettings): SMTPTransport.Options {
  return {
    host: s.host,
    port: s.port,
    secure: s.security === "ssl",
    requireTLS: s.security === "starttls",
    ignoreTLS: s.security === "none",
    auth: s.username ? { user: s.username, pass: s.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}
