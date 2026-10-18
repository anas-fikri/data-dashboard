import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { readSmtpFile, transportOptions } from "@/lib/smtp-settings";

const globalForMail = globalThis as unknown as { mailer?: Transporter; mailerKey?: string };

/**
 * Transport SMTP bersama (Mailpit di dev, SMTP perusahaan di produksi): pengaturan Admin › Email bila ada
 * (T-byys), selain itu SMTP_URL. Dibuat ulang saat pengaturan berubah — tanpa restart. Timeout pendek agar
 * SMTP lambat tidak menggantung tugas latar (default nodemailer: socket 10 menit).
 */
export function mailer(): Transporter {
  const file = readSmtpFile();
  const key = file ? JSON.stringify(file) : env().SMTP_URL;
  if (!globalForMail.mailer || globalForMail.mailerKey !== key) {
    globalForMail.mailer?.close();
    globalForMail.mailer = file
      ? nodemailer.createTransport(transportOptions(file))
      : nodemailer.createTransport(urlWithTimeouts(env().SMTP_URL));
    globalForMail.mailerKey = key;
  }
  return globalForMail.mailer;
}

/** Pengirim: dari Admin › Email bila ada, selain itu MAIL_FROM. */
export function mailFrom(): string | { name: string; address: string } {
  const file = readSmtpFile();
  return file ? { name: file.fromName, address: file.fromAddress } : env().MAIL_FROM;
}

function urlWithTimeouts(raw: string): string {
  // Nodemailer membaca opsi transport dari query string URL koneksi.
  const url = new URL(raw);
  const defaults = { connectionTimeout: "10000", greetingTimeout: "10000", socketTimeout: "20000" };
  for (const [k, v] of Object.entries(defaults)) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.toString();
}
