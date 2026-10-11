import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

const globalForMail = globalThis as unknown as { mailer?: Transporter };

/**
 * Transport SMTP bersama (Mailpit di dev, SMTP perusahaan di produksi). Timeout pendek agar
 * SMTP lambat tidak menggantung tugas latar (default nodemailer: socket 10 menit).
 */
export function mailer(): Transporter {
  if (!globalForMail.mailer) {
    // Nodemailer membaca opsi transport dari query string URL koneksi.
    const url = new URL(env().SMTP_URL);
    const defaults = {
      connectionTimeout: "10000",
      greetingTimeout: "10000",
      socketTimeout: "20000",
    };
    for (const [k, v] of Object.entries(defaults)) {
      if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    }
    globalForMail.mailer = nodemailer.createTransport(url.toString());
  }
  return globalForMail.mailer;
}
