import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mailer } from "@/lib/mail";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function send(to: string, subject: string, text: string, html: string): Promise<boolean> {
  try {
    await mailer().sendMail({ from: env().MAIL_FROM, to, subject, text, html });
    return true;
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), to }, "gagal mengirim email");
    return false;
  }
}

/** Tautan verifikasi dari APP_URL (bukan Host header) agar tidak bisa diarahkan ke domain lain. */
export function verifyLink(token: string): string {
  return `${env().APP_URL}/verify?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const link = verifyLink(token);
  const text = `Halo,\n\nKlik tautan berikut untuk mengaktifkan akun Data Dashboard Anda (berlaku 24 jam):\n${link}\n\nJika Anda tidak mendaftar, abaikan email ini.`;
  const html = `<p>Halo,</p><p>Klik tautan berikut untuk mengaktifkan akun Data Dashboard Anda (berlaku 24 jam):</p><p><a href="${escapeHtml(link)}">Aktifkan akun</a></p><p>Jika Anda tidak mendaftar, abaikan email ini.</p>`;
  return send(to, "Aktifkan akun Data Dashboard", text, html);
}

/** Dikirim saat seseorang mendaftar dengan email yang sudah ada (anti-enumerasi di UI). */
export async function sendAlreadyRegisteredEmail(to: string): Promise<boolean> {
  const login = `${env().APP_URL}/login`;
  const text = `Halo,\n\nSeseorang mencoba mendaftar dengan email ini, tetapi akun Anda sudah ada. Masuk di ${login}. Jika bukan Anda, abaikan email ini.`;
  const html = `<p>Halo,</p><p>Seseorang mencoba mendaftar dengan email ini, tetapi akun Anda sudah ada. <a href="${escapeHtml(login)}">Masuk di sini</a>. Jika bukan Anda, abaikan email ini.</p>`;
  return send(to, "Akun Data Dashboard Anda sudah ada", text, html);
}
