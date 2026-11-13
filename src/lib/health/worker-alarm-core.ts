/*
 * Alarm worker mati dari app (T-r5tm): monitor email berjalan di dalam worker, jadi tidak bisa memberi
 * tahu bahwa worker sendiri mati. App memeriksa jumlah worker antrean ingest tiap menit; bila 0 terus-menerus
 * (atau mati-hidup berulang tanpa stabil) selama ≥ WORKER_DOWN_ALERT_MS, admin diberi email, diulang tiap REMIND_MS, dan sekali saat pulih.
 * Keputusan murni (diuji); tidak diketahui (null) tidak mengubah apa pun.
 */
import { REMIND_MS } from "@/lib/monitor";

export const WORKER_DOWN_ALERT_MS = 10 * 60 * 1000;

export interface WorkerAlarmState {
  /** Sejak kapan pertama terbaca 0 worker (belum stabil hidup lagi); null = sehat. */
  downSince: number | null;
  /** Email peringatan terakhir; null = belum pernah untuk kejadian ini. */
  alertedAt: number | null;
  /**
   * Sejak kapan worker terbaca hidup lagi setelah sempat 0 (T-q8vr): kejadian baru dianggap selesai hanya
   * setelah hidup stabil ≥ WORKER_DOWN_ALERT_MS, sehingga worker yang crash-loop (hidup sebentar lalu mati)
   * tetap memicu alarm. null = sedang 0 atau sehat.
   */
  upSince: number | null;
}

export const WORKER_ALARM_IDLE: WorkerAlarmState = {
  downSince: null,
  alertedAt: null,
  upSince: null,
};

export function decideWorkerAlarm(
  prev: WorkerAlarmState,
  count: number | null,
  now: number,
): { send: "alert" | "recovered" | null; state: WorkerAlarmState } {
  if (count === null) return { send: null, state: prev };
  if (count > 0) {
    if (prev.downSince === null) return { send: null, state: WORKER_ALARM_IDLE };
    const upSince = prev.upSince ?? now;
    if (now - upSince >= WORKER_DOWN_ALERT_MS) {
      return { send: prev.alertedAt !== null ? "recovered" : null, state: WORKER_ALARM_IDLE };
    }
    return { send: null, state: { ...prev, upSince } };
  }
  const downSince = prev.downSince ?? now;
  if (now - downSince < WORKER_DOWN_ALERT_MS) {
    return { send: null, state: { downSince, alertedAt: prev.alertedAt, upSince: null } };
  }
  if (prev.alertedAt === null || now - prev.alertedAt >= REMIND_MS) {
    return { send: "alert", state: { downSince, alertedAt: now, upSince: null } };
  }
  return { send: null, state: { downSince, alertedAt: prev.alertedAt, upSince: null } };
}

export function parseWorkerAlarm(raw: string | null): WorkerAlarmState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<WorkerAlarmState>) : null;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return v
      ? { downSince: n(v.downSince), alertedAt: n(v.alertedAt), upSince: n(v.upSince) }
      : WORKER_ALARM_IDLE;
  } catch {
    return WORKER_ALARM_IDLE;
  }
}

export function workerAlarmMail(
  kind: "alert" | "recovered",
  downSince: number | null,
  now: number,
  appUrl: string,
): { subject: string; text: string } {
  if (kind === "recovered") {
    return {
      subject: "[Data Dashboard] Pulih: pemroses (worker) aktif lagi",
      text: `Pemroses (worker) kembali terhubung ke antrean dan stabil selama 10 menit. Unggahan, pemetaan, koreksi skema, dan ekspor yang menunggu diproses otomatis.\n\nCek: ${appUrl}/health\n`,
    };
  }
  const minutes = downSince === null ? 0 : Math.floor((now - downSince) / 60_000);
  return {
    subject: "[Data Dashboard] Pemroses (worker) tidak aktif",
    text:
      `Pemroses (worker) tidak terhubung ke antrean (terus-menerus atau berulang kali mati) sejak ±${minutes} menit lalu. ` +
      `Unggahan, pemetaan, koreksi skema, dan ekspor tidak berjalan sampai service worker dinyalakan lagi ` +
      `(runbook-deploy §28).\n\nEmail ini diulang tiap 6 jam selama masih mati, dan dikirim sekali saat pulih.` +
      `\nCek: ${appUrl}/health\n`,
  };
}
