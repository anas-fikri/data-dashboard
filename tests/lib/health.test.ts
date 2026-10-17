import { describe, expect, it, vi } from "vitest";
import {
  cachedHealthReport,
  isDetailed,
  publicView,
  runHealthChecks,
  safeMessage,
} from "@/lib/health";
import {
  configCheck,
  coreChecks,
  infraChecks,
  rendererCheck,
  rendererChecks,
} from "@/lib/health/checks";

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

  it("kelompok berbeda (key) tidak berbagi cache", async () => {
    const fail = await cachedHealthReport(
      [{ name: "Y", run: async () => Promise.reject(new Error("mati")) }],
      Date.now() + 20_000,
      "uji-a",
    );
    const ok = await cachedHealthReport(
      [{ name: "Z", run: async () => "ok" }],
      Date.now() + 20_000,
      "uji-b",
    );
    expect([fail.status, ok.status]).toEqual(["fail", "ok"]);
  });
});

// Healthcheck container (/api/health/core) hanya kebutuhan inti: SMTP/renderer mati tidak boleh
// membuat app "unhealthy" (proxy depends_on app → seluruh situs mati saat compose up).
describe("coreChecks", () => {
  it("tanpa SMTP dan renderer; infraChecks = inti + SMTP", () => {
    expect(coreChecks().map((c) => c.name)).toEqual([
      "Konfigurasi",
      "PostgreSQL",
      "Redis",
      "Object storage",
    ]);
    expect(infraChecks().map((c) => c.name)).toEqual([
      "Konfigurasi",
      "PostgreSQL",
      "Redis",
      "Object storage",
      "SMTP",
    ]);
  });
});

describe("publicView", () => {
  it("non-admin hanya melihat status keseluruhan; admin melihat laporan lengkap", () => {
    const report = {
      status: "fail" as const,
      checkedAt: "2026-10-11T00:00:00Z",
      items: [
        { name: "A", status: "ok" as const, detail: "SELECT 1", latencyMs: 1 },
        { name: "B", status: "fail" as const, detail: "ECONNREFUSED [host]", latencyMs: 1 },
      ],
    };
    const pub = publicView(report, false);
    expect(pub).toEqual({ status: "fail", checkedAt: "2026-10-11T00:00:00Z" });
    expect(isDetailed(pub)).toBe(false);
    const admin = publicView(report, true);
    expect(admin).toBe(report);
    expect(isDetailed(admin)).toBe(true);
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
    expect(safeMessage(new Error("connect ECONNREFUSED ::1:6380"))).not.toContain("6380");
    expect(safeMessage(new Error("getaddrinfo ENOTFOUND redis.internal"))).toBe(
      "getaddrinfo ENOTFOUND [host]",
    );
    expect(safeMessage(new Error("535 auth failed user=anas@x.id"))).not.toContain("anas");
  });

  it("hanya baris pertama dan dipotong", () => {
    const msg = safeMessage(new Error(`${"a".repeat(300)}\nstack line`));
    expect(msg.length).toBeLessThanOrEqual(160);
    expect(msg).not.toContain("stack");
  });
});

/*
 * T-018 (T-023 AC: /health memuat renderer): renderer diperiksa hanya di produksi dengan RENDERER_URL;
 * mati → gagal tanpa URL di detail.
 */
describe("renderer PDF di /health", () => {
  it("hanya produksi + RENDERER_URL terisi", () => {
    const url = { RENDERER_URL: "http://renderer:3200", RENDERER_SECRET: "s".repeat(43) };
    expect(rendererChecks({ NODE_ENV: "development", ...url })).toEqual([]);
    expect(rendererChecks({ NODE_ENV: "production" })).toEqual([]);
    const checks = rendererChecks({ NODE_ENV: "production", ...url });
    expect(checks.map((c) => c.name)).toEqual(["Renderer PDF"]);
  });

  it("hidup → ok; mati → fail tanpa URL internal", async () => {
    const up = await runHealthChecks([rendererCheck({ health: async () => true })]);
    expect(up.items[0]).toMatchObject({ name: "Renderer PDF", status: "ok" });
    const down = await runHealthChecks([rendererCheck({ health: async () => false })]);
    expect(down.status).toBe("fail");
    expect(down.items[0]?.detail).toBe("renderer tidak menjawab /healthz");
  });
});
