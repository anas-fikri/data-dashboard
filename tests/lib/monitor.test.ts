import { describe, expect, it } from "vitest";
import {
  REMIND_MS,
  UPLOAD_FAIL_THRESHOLD,
  alertMail,
  collectProblems,
  decideAlert,
} from "@/lib/monitor";

const p = (key: string) => ({ key, text: key });

describe("pantauan: kapan email dikirim", () => {
  it("sehat terus → tidak pernah kirim", () => {
    expect(decideAlert(null, [], 1000).send).toBeNull();
  });

  it("masalah baru → kirim; sama dalam 6 jam → diam; ≥ 6 jam → pengingat", () => {
    const a = decideAlert(null, [p("health:Redis")], 0);
    expect(a.send).toBe("alert");
    expect(decideAlert(a.state, [p("health:Redis")], REMIND_MS - 1).send).toBeNull();
    expect(decideAlert(a.state, [p("health:Redis")], REMIND_MS).send).toBe("alert");
  });

  it("himpunan masalah berubah → kirim lagi; urutan tidak berpengaruh", () => {
    const a = decideAlert(null, [p("backup"), p("uploads")], 0);
    expect(decideAlert(a.state, [p("uploads"), p("backup")], 10).send).toBeNull();
    expect(decideAlert(a.state, [p("backup")], 10).send).toBe("alert");
  });

  it("pulih → satu email pulih, sesudahnya diam", () => {
    const a = decideAlert(null, [p("backup")], 0);
    const r = decideAlert(a.state, [], 10);
    expect(r.send).toBe("recovered");
    expect(decideAlert(r.state, [], 20).send).toBeNull();
  });
});

describe("pantauan: masalah yang dikumpulkan", () => {
  it("health gagal, backup, dan lonjakan unggahan gagal", () => {
    const got = collectProblems({
      health: [
        { name: "Redis", status: "fail", detail: "timeout" },
        { name: "PostgreSQL", status: "ok", detail: "ok" },
      ],
      backup: { text: "Backup terakhir gagal." },
      failedUploadsLastHour: UPLOAD_FAIL_THRESHOLD,
    });
    expect(got.map((x) => x.key)).toEqual(["health:Redis", "backup", "uploads"]);
  });

  it("unggahan gagal di bawah ambang tidak dilaporkan", () => {
    expect(
      collectProblems({
        health: [],
        backup: null,
        failedUploadsLastHour: UPLOAD_FAIL_THRESHOLD - 1,
      }),
    ).toEqual([]);
  });

  it("isi email menyebut masalah dan tautan admin", () => {
    const m = alertMail("alert", [p("Redis bermasalah")], "https://x.test");
    expect(m.subject).toContain("1 masalah");
    expect(m.text).toContain("- Redis bermasalah");
    expect(m.text).toContain("https://x.test/admin");
    expect(alertMail("recovered", [], "https://x.test").subject).toContain("Pulih");
  });
});
