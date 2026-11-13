/*
 * Alarm worker mati dari app (T-r5tm): monitor email berjalan di dalam worker, jadi tidak bisa memberi
 * tahu bahwa worker sendiri mati. App memeriksa jumlah worker antrean ingest tiap menit; bila 0 terus-menerus
 * selama ≥ WORKER_DOWN_ALERT_MS, admin diberi email, diulang tiap REMIND_MS, dan sekali saat pulih.
 * Keputusan murni (diuji); tidak diketahui (null) tidak mengubah apa pun.
 */
import { REMIND_MS } from "@/lib/monitor";

export const WORKER_DOWN_ALERT_MS = 10 * 60 * 1000;

export interface WorkerAlarmState {
  /** Sejak kapan terbaca 0 worker berturut-turut; null = ada worker. */
  downSince: number | null;
  /** Email peringatan terakhir; null = belum pernah untuk kejadian ini. */
  alertedAt: number | null;
}

export const WORKER_ALARM_IDLE: WorkerAlarmState = { downSince: null, alertedAt: null };

export function decideWorkerAlarm(
  prev: WorkerAlarmState,
  count: number | null,
  now: number,
): { send: "alert" | "recovered" | null; state: WorkerAlarmState } {
  if (count === null) return { send: null, state: prev };
  if (count > 0) {
    return { send: prev.alertedAt !== null ? "recovered" : null, state: WORKER_ALARM_IDLE };
  }
  const downSince = prev.downSince ?? now;
  if (now - downSince < WORKER_DOWN_ALERT_MS) {
    return { send: null, state: { downSince, alertedAt: null } };
  }
  if (prev.alertedAt === null || now - prev.alertedAt >= REMIND_MS) {
    return { send: "alert", state: { downSince, alertedAt: now } };
  }
  return { send: null, state: { downSince, alertedAt: prev.alertedAt } };
}

export function parseWorkerAlarm(raw: string | null): WorkerAlarmState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<WorkerAlarmState>) : null;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return v ? { downSince: n(v.downSince), alertedAt: n(v.alertedAt) } : WORKER_ALARM_IDLE;
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
      text: `Pemroses (worker) kembali terhubung ke antrean. Unggahan, pemetaan, koreksi skema, dan ekspor yang menunggu diproses otomatis.\n\nCek: ${appUrl}/health\n`,
    };
  }
  const minutes = downSince === null ? 0 : Math.floor((now - downSince) / 60_000);
  return {
    subject: "[Data Dashboard] Pemroses (worker) tidak aktif",
    text:
      `Tidak ada pemroses (worker) yang terhubung ke antrean selama ±${minutes} menit. ` +
      `Unggahan, pemetaan, koreksi skema, dan ekspor tidak berjalan sampai service worker dinyalakan lagi ` +
      `(runbook-deploy §28).\n\nEmail ini diulang tiap 6 jam selama masih mati, dan dikirim sekali saat pulih.` +
      `\nCek: ${appUrl}/health\n`,
  };
}
