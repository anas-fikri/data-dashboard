import { describe, expect, it, vi } from "vitest";
import { cachedHealthReport, publicView, runHealthChecks, safeMessage } from "@/lib/health";
import { configCheck } from "@/lib/health/checks";

describe("runHealthChecks", () => {
  it("semua ok → status ok dengan detail per item", async () => {
    const report = await runHealthChecks([
      { name: "A", run: async () => "a ok" },
      { name: "B", run: async () => "b ok" },
    ]);
    expect(report.status).toBe("ok");
    expect(report.items.map((i) => [i.name, i.status, i.detail])).toEqual([
      ["A", "ok", "a ok"],
      ["B", "ok", "b ok"],
    ]);
  });

  it("satu gagal tidak menghentikan yang lain dan status menjadi fail", async () => {
    const report = await runHealthChecks([
      { name: "A", run: async () => "a ok" },
      {
        name: "B",
        run: async () => {
          throw new Error("koneksi ditolak");
        },
      },
    ]);
    expect(report.status).toBe("fail");
    expect(report.items[0]?.status).toBe("ok");
    expect(report.items[1]).toMatchObject({ status: "fail", detail: "koneksi ditolak" });
  });

  it("pemeriksaan yang menggantung dibatasi timeout", async () => {
    const report = await runHealthChecks(
      [{ name: "Lambat", run: () => new Promise<string>(() => {}) }],
      20,
    );
    expect(report.items[0]).toMatchObject({ status: "fail" });
    expect(report.items[0]?.detail).toMatch(/timeout/);
  });
});

describe("cachedHealthReport", () => {
  it("permintaan bersamaan dan dalam 5 detik hanya menjalankan pemeriksaan sekali", async () => {
    const run = vi.fn(async () => "ok");
    const checks = [{ name: "X", run }];
    const [a, b] = await Promise.all([cachedHealthReport(checks), cachedHealthReport(checks)]);
    await cachedHealthReport(checks);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    await cachedHealthReport(checks, Date.now() + 10_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("publicView", () => {
  it("menyembunyikan detail bila tidak boleh diekspos", () => {
    const report = {
      status: "fail" as const,
      checkedAt: "2026-10-11T00:00:00Z",
      items: [
        { name: "A", status: "ok" as const, detail: "SELECT 1", latencyMs: 1 },
        { name: "B", status: "fail" as const, detail: "ECONNREFUSED [host]", latencyMs: 1 },
      ],
    };
    expect(publicView(report, false).items.map((i) => i.detail)).toEqual([
      "OK",
      "bermasalah, lihat log server",
    ]);
    expect(publicView(report, true)).toBe(report);
  });
});

describe("configCheck", () => {
  it("gagal dengan nama variabel bila masih ada placeholder", async () => {
    const base: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3100",
      APP_HOST: "localhost:3100",
      DATABASE_URL: "postgresql://app:dummy@127.0.0.1:5433/db",
      REDIS_URL: "redis://:dummy@127.0.0.1:6380/0",
      S3_ENDPOINT: "http://127.0.0.1:9100",
      S3_PUBLIC_ENDPOINT: "http://localhost:9100",
      S3_BUCKET: "b",
      S3_ACCESS_KEY: "k",
      S3_SECRET_KEY: "dummy-secret-key",
      SMTP_URL: "smtp://127.0.0.1:1026",
      MAIL_FROM: "x@y.id",
      ALLOWED_EMAIL_DOMAINS: "y.id",
    };
    await expect(configCheck({ ...base, AUTH_SECRET: "a".repeat(40) }).run()).resolves.toMatch(
      /tidak ada placeholder/,
    );
    const check = configCheck({ ...base, AUTH_SECRET: "change-me-" + "a".repeat(30) });
    await expect(check.run()).rejects.toThrow(/placeholder: AUTH_SECRET/);
  });
});

describe("safeMessage", () => {
  it("menyembunyikan URL koneksi, host:port, dan nama yang dikutip driver", () => {
    expect(
      safeMessage(new Error("gagal ke postgresql://app:dummy-rahasia@db:5432/x")),
    ).not.toContain("rahasia");
    const prisma = safeMessage(
      new Error("Can't reach database server at `127.0.0.1:5433`, credentials for `app`"),
    );
    expect(prisma).not.toContain("5433");
    expect(prisma).not.toContain("app`");
    expect(safeMessage(new Error("connect ECONNREFUSED 127.0.0.1:6380"))).not.toContain("6380");
    expect(safeMessage(new Error("connect ECONNREFUSED localhost:6380"))).not.toContain("6380");
  });

  it("hanya baris pertama dan dipotong", () => {
    const msg = safeMessage(new Error(`${"a".repeat(300)}\nstack line`));
    expect(msg.length).toBeLessThanOrEqual(160);
    expect(msg).not.toContain("stack");
  });
});
