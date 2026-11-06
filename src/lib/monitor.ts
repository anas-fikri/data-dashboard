/*
 * Pantauan + peringatan email admin (T-8g53, v1.8.0): job worker tiap 15 menit memeriksa layanan
 * (PostgreSQL, Redis, storage, SMTP, renderer), status backup, dan lonjakan unggahan gagal. Email
 * dikirim ke semua admin aktif saat daftar masalah BERUBAH, diulang tiap 6 jam selama masih ada,
 * dan sekali saat semua pulih — bukan tiap 15 menit. Keputusan kirim murni (decideAlert), diuji.
 */

export interface Problem {
  /** Kunci stabil (mis. "health:Redis") — perubahan himpunan kunci = kejadian baru. */
  key: string;
  text: string;
}

export interface MonitorState {
  /** Kunci masalah terakhir yang dilaporkan, urut; "" = sehat. */
  sig: string;
  sentAt: number;
}

export const REMIND_MS = 6 * 60 * 60 * 1000;

export type AlertDecision =
  | { send: "alert"; state: MonitorState }
  | { send: "recovered"; state: MonitorState }
  | { send: null; state: MonitorState };

export function decideAlert(
  prev: MonitorState | null,
  problems: readonly Problem[],
  now: number,
): AlertDecision {
  const sig = problems
    .map((p) => p.key)
    .sort()
    .join("|");
  const last = prev ?? { sig: "", sentAt: 0 };
  if (!sig) {
    return last.sig
      ? { send: "recovered", state: { sig: "", sentAt: now } }
      : { send: null, state: last };
  }
  if (sig !== last.sig || now - last.sentAt >= REMIND_MS) {
    return { send: "alert", state: { sig, sentAt: now } };
  }
  return { send: null, state: last };
}

/** Isi email (teks biasa, tanpa rahasia: detail health sudah disaring safeMessage). */
export function alertMail(
  kind: "alert" | "recovered",
  problems: readonly Problem[],
  appUrl: string,
): { subject: string; text: string } {
  if (kind === "recovered") {
    return {
      subject: "[Data Dashboard] Pulih: semua pemeriksaan normal",
      text: `Semua pemeriksaan kembali normal.\n\nCek: ${appUrl}/admin\n`,
    };
  }
  return {
    subject: `[Data Dashboard] Perlu perhatian: ${problems.length} masalah`,
    text:
      `Pemeriksaan otomatis (tiap 15 menit) menemukan:\n\n` +
      problems.map((p) => `- ${p.text}`).join("\n") +
      `\n\nEmail ini diulang tiap 6 jam selama masalah masih ada, dan dikirim sekali saat pulih.` +
      `\nCek: ${appUrl}/admin\n`,
  };
}

/** Ambang unggahan gagal dalam 60 menit terakhir yang dianggap lonjakan. */
export const UPLOAD_FAIL_THRESHOLD = 3;

export function collectProblems(input: {
  health: readonly { name: string; status: "ok" | "fail"; detail: string }[];
  backup: { text: string } | null;
  failedUploadsLastHour: number;
}): Problem[] {
  const out: Problem[] = input.health
    .filter((h) => h.status === "fail")
    .map((h) => ({ key: `health:${h.name}`, text: `${h.name} bermasalah: ${h.detail}` }));
  if (input.backup) out.push({ key: "backup", text: `Backup: ${input.backup.text}` });
  if (input.failedUploadsLastHour >= UPLOAD_FAIL_THRESHOLD) {
    out.push({
      key: "uploads",
      text: `${input.failedUploadsLastHour} unggahan gagal dalam 60 menit terakhir.`,
    });
  }
  return out;
}
