import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

const globalForMail = globalThis as unknown as { mailer?: Transporter };

/** Transport SMTP bersama (Mailpit di dev, SMTP perusahaan di produksi). */
export function mailer(): Transporter {
  if (!globalForMail.mailer) {
    globalForMail.mailer = nodemailer.createTransport(env().SMTP_URL);
  }
  return globalForMail.mailer;
}
