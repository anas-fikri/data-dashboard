import "server-only";
import { createHash } from "node:crypto";
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
    // Tanpa alamat email di log (PII): cukup hash pendek untuk korelasi.
    const toRef = createHash("sha256").update(to).digest("hex").slice(0, 12);
    logger.error(
      { err: e instanceof Error ? e.message : String(e), toRef },
      "gagal mengirim email",
    );
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

/** Pemberitahuan setelah kredensial berubah (ASVS V2.2.3): pemilik tahu bila bukan dia pelakunya. */
export async function sendPasswordChangedEmail(
  to: string,
  how: "reset" | "change",
): Promise<boolean> {
  const when = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const action =
    how === "reset" ? "diatur ulang lewat tautan email" : "diganti dari halaman Keamanan";
  const recover = `${env().APP_URL}/lupa-password`;
  const text = `Halo,\n\nPassword akun Data Dashboard Anda ${action} pada ${when} WIB. Semua perangkat lain sudah dikeluarkan.\n\nBukan Anda? Segera atur ulang password: ${recover} lalu hubungi admin.`;
  const html = `<p>Halo,</p><p>Password akun Data Dashboard Anda ${escapeHtml(action)} pada ${escapeHtml(when)} WIB. Semua perangkat lain sudah dikeluarkan.</p><p>Bukan Anda? <a href="${escapeHtml(recover)}">Segera atur ulang password</a> lalu hubungi admin.</p>`;
  return send(to, "Password Data Dashboard Anda berubah", text, html);
}

/** Tautan reset dari APP_URL (bukan Host header); berlaku 30 menit, sekali pakai. */
export function resetLink(token: string): string {
  return `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const link = resetLink(token);
  const text = `Halo,\n\nAda permintaan atur ulang password akun Data Dashboard Anda. Buka tautan berikut dalam 30 menit:\n${link}\n\nJika bukan Anda, abaikan email ini; password Anda tidak berubah.`;
  const html = `<p>Halo,</p><p>Ada permintaan atur ulang password akun Data Dashboard Anda. Buka tautan berikut dalam 30 menit:</p><p><a href="${escapeHtml(link)}">Atur ulang password</a></p><p>Jika bukan Anda, abaikan email ini; password Anda tidak berubah.</p>`;
  return send(to, "Atur ulang password Data Dashboard", text, html);
}

/** Undangan akun dari admin (T-c7wf): tautan buat password memakai alur reset, 72 jam, sekali pakai. */
export async function sendInvitationEmail(to: string, token: string): Promise<boolean> {
  const link = resetLink(token);
  const recover = `${env().APP_URL}/lupa-password`;
  const text = `Halo,\n\nAdmin membuatkan akun Data Dashboard untuk Anda. Buat password lewat tautan berikut (berlaku 72 jam, sekali pakai):\n${link}\n\nTautan sudah kedaluwarsa? Minta tautan baru di ${recover}.`;
  const html = `<p>Halo,</p><p>Admin membuatkan akun Data Dashboard untuk Anda. Buat password lewat tautan berikut (berlaku 72 jam, sekali pakai):</p><p><a href="${escapeHtml(link)}">Buat password</a></p><p>Tautan sudah kedaluwarsa? <a href="${escapeHtml(recover)}">Minta tautan baru</a>.</p>`;
  return send(to, "Undangan akun Data Dashboard", text, html);
}
