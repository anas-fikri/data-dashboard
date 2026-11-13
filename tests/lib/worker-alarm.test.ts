import { describe, expect, it } from "vitest";
import {
  decideWorkerAlarm,
  parseWorkerAlarm,
  WORKER_ALARM_IDLE,
  WORKER_DOWN_ALERT_MS,
  workerAlarmMail,
} from "@/lib/health/worker-alarm-core";
import { REMIND_MS } from "@/lib/monitor";

describe("alarm worker mati (T-r5tm)", () => {
  it("menunggu 10 menit berturut-turut sebelum email, lalu ulang tiap 6 jam, dan sekali saat pulih", () => {
    let s = WORKER_ALARM_IDLE;
    let d = decideWorkerAlarm(s, 0, 1_000);
    expect(d.send).toBeNull();
    s = d.state;
    expect(s.downSince).toBe(1_000);
    d = decideWorkerAlarm(s, 0, 1_000 + WORKER_DOWN_ALERT_MS - 1);
    expect(d.send).toBeNull();
    d = decideWorkerAlarm(d.state, 0, 1_000 + WORKER_DOWN_ALERT_MS);
    expect(d.send).toBe("alert");
    const at = d.state.alertedAt!;
    d = decideWorkerAlarm(d.state, 0, at + 60_000);
    expect(d.send).toBeNull();
    d = decideWorkerAlarm(d.state, 0, at + REMIND_MS);
    expect(d.send).toBe("alert");
    // Pulih dihitung setelah hidup stabil 10 menit (T-q8vr).
    const up = at + REMIND_MS + 60_000;
    d = decideWorkerAlarm(d.state, 2, up);
    expect(d.send).toBeNull();
    d = decideWorkerAlarm(d.state, 2, up + WORKER_DOWN_ALERT_MS);
    expect(d).toEqual({ send: "recovered", state: WORKER_ALARM_IDLE });
  });

  it("tidak diketahui tidak mengubah status; worker kembali sebelum ambang tidak mengirim apa pun", () => {
    const s = { downSince: 5, alertedAt: null, upSince: null };
    expect(decideWorkerAlarm(s, null, 99_999_999)).toEqual({ send: null, state: s });
    const up = decideWorkerAlarm(s, 1, 60_000);
    expect(up.send).toBeNull();
    expect(decideWorkerAlarm(up.state, 1, 60_000 + WORKER_DOWN_ALERT_MS)).toEqual({
      send: null,
      state: WORKER_ALARM_IDLE,
    });
  });

  it("status rusak di Redis → idle; email menyebut lama mati", () => {
    expect(parseWorkerAlarm("{bad")).toEqual(WORKER_ALARM_IDLE);
    expect(parseWorkerAlarm('{"downSince":"x","alertedAt":3}')).toEqual({
      downSince: null,
      alertedAt: 3,
      upSince: null,
    });
    expect(workerAlarmMail("alert", 0, 12 * 60_000, "https://x").text).toContain("±12 menit");
    expect(workerAlarmMail("recovered", null, 0, "https://x").subject).toContain("Pulih");
  });

  it("worker crash-loop (hidup sebentar, mati lagi) tetap memicu alarm (T-q8vr)", () => {
    let d = decideWorkerAlarm(WORKER_ALARM_IDLE, 0, 0);
    for (let t = 60_000; t < WORKER_DOWN_ALERT_MS; t += 60_000) {
      d = decideWorkerAlarm(d.state, t % 180_000 === 0 ? 1 : 0, t);
      expect(d.send).toBeNull();
    }
    d = decideWorkerAlarm(d.state, 0, WORKER_DOWN_ALERT_MS);
    expect(d.send).toBe("alert");
    expect(d.state.downSince).toBe(0);
  });
});
