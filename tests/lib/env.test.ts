import { describe, expect, it } from "vitest";
import { findPlaceholderVars, isHstsPreloadedHttp, parseEnv } from "@/lib/env";

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3100",
  APP_HOST: "localhost:3100",
  DATABASE_URL: "postgresql://app:dummy@127.0.0.1:5433/db",
  REDIS_URL: "redis://:dummy@127.0.0.1:6380/0",
  S3_ENDPOINT: "http://127.0.0.1:9100",
  S3_PUBLIC_ENDPOINT: "http://localhost:9100",
  S3_BUCKET: "data-dashboard",
  S3_ACCESS_KEY: "app-key",
  S3_SECRET_KEY: "dummy-secret-key",
  SMTP_URL: "smtp://127.0.0.1:1026",
  MAIL_FROM: "no-reply@example.com",
  AUTH_SECRET: "x".repeat(32),
  ALLOWED_EMAIL_DOMAINS: " PCPExpress.com, innaka.dev ,",
};

describe("parseEnv", () => {
  it("menerima env lengkap dan menormalkan domain serta AUTH_SECRET", () => {
    const env = parseEnv(valid);
    expect(env.ALLOWED_EMAIL_DOMAINS).toEqual(["pcpexpress.com", "innaka.dev"]);
    expect(env.AUTH_SECRET).toEqual(["x".repeat(32)]);
    expect(env.MAX_UPLOAD_BYTES).toBe(1024 * 1024 * 1024);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("EXPORT_DUCKDB_MEMORY: default 768MB (review T-017 INT-R2-1), format ukuran divalidasi", () => {
    expect(parseEnv(valid).EXPORT_DUCKDB_MEMORY).toBe("768MB");
    expect(parseEnv({ ...valid, EXPORT_DUCKDB_MEMORY: "1GB" }).EXPORT_DUCKDB_MEMORY).toBe("1GB");
    expect(() => parseEnv({ ...valid, EXPORT_DUCKDB_MEMORY: "banyak" })).toThrow(
      /EXPORT_DUCKDB_MEMORY/,
    );
  });

  it("INGEST_DUCKDB_THREADS: default 2, 1–16 (T-024)", () => {
    expect(parseEnv(valid).INGEST_DUCKDB_THREADS).toBe(2);
    expect(parseEnv({ ...valid, INGEST_DUCKDB_THREADS: "3" }).INGEST_DUCKDB_THREADS).toBe(3);
    expect(() => parseEnv({ ...valid, INGEST_DUCKDB_THREADS: "0" })).toThrow(
      /INGEST_DUCKDB_THREADS/,
    );
    expect(() => parseEnv({ ...valid, INGEST_DUCKDB_THREADS: "17" })).toThrow(
      /INGEST_DUCKDB_THREADS/,
    );
  });

  it("gagal cepat dengan nama variabel yang hilang", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("menolak AUTH_SECRET pendek dan menerima beberapa secret untuk rotasi", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "secret" })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv({ ...valid, AUTH_SECRET: `${"a".repeat(32)},short` })).toThrow(
      /AUTH_SECRET/,
    );
    expect(
      parseEnv({ ...valid, AUTH_SECRET: `${"a".repeat(32)}, ${"b".repeat(40)}` }).AUTH_SECRET,
    ).toHaveLength(2);
  });

  it("menolak REDIS_URL tanpa password", () => {
    expect(() => parseEnv({ ...valid, REDIS_URL: "redis://127.0.0.1:6380/0" })).toThrow(
      /REDIS_URL/,
    );
  });

  it("menolak ALLOWED_EMAIL_DOMAINS kosong atau tidak valid", () => {
    expect(() => parseEnv({ ...valid, ALLOWED_EMAIL_DOMAINS: " , " })).toThrow(
      /ALLOWED_EMAIL_DOMAINS/,
    );
    expect(() => parseEnv({ ...valid, ALLOWED_EMAIL_DOMAINS: "bukan domain" })).toThrow(
      /ALLOWED_EMAIL_DOMAINS/,
    );
  });

  it("cache hasil query default 64 MiB dan dibatasi 512 MiB (review T-009 N1)", () => {
    expect(parseEnv(valid).QUERY_RESULT_CACHE_BYTES).toBe(64 * 1024 * 1024);
    expect(() => parseEnv({ ...valid, QUERY_RESULT_CACHE_BYTES: String(2 ** 30) })).toThrow(
      /QUERY_RESULT_CACHE_BYTES/,
    );
  });

  it("menolak LOG_LEVEL yang tidak dikenal", () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });

  it("menolak start produksi bila masih ada placeholder, tetapi membiarkannya di development", () => {
    const withPlaceholder = { ...valid, S3_SECRET_KEY: "change-me-now" };
    expect(() => parseEnv({ ...withPlaceholder, NODE_ENV: "production" })).toThrow(
      /Menolak start produksi.*S3_SECRET_KEY/,
    );
    expect(() => parseEnv({ ...withPlaceholder, NODE_ENV: "development" })).not.toThrow();
  });
});

describe("parseEnv produksi", () => {
  const prod = {
    ...valid,
    NODE_ENV: "production",
    APP_URL: "https://dashboard.pcpexpress.com",
    TRUST_PROXY: "true",
  } as NodeJS.ProcessEnv;

  it("menerima konfigurasi produksi yang lengkap", () => {
    expect(() => parseEnv(prod)).not.toThrow();
  });

  it("menolak TRUST_PROXY=false dan APP_URL http di produksi", () => {
    expect(() => parseEnv({ ...prod, TRUST_PROXY: "false" })).toThrow(/TRUST_PROXY/);
    expect(() => parseEnv({ ...prod, APP_URL: "http://dashboard.local" })).toThrow(/https/);
  });
});

describe("findPlaceholderVars", () => {
  it("kosong bila tidak ada placeholder", () => {
    expect(findPlaceholderVars(valid)).toEqual([]);
  });

  it("mendeteksi nilai dari .env.example tanpa peduli kapital", () => {
    const withPlaceholders = {
      ...valid,
      AUTH_SECRET: "Change-Me",
      S3_ACCESS_KEY: "MinioAdmin",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/db",
    };
    expect(findPlaceholderVars(withPlaceholders).sort()).toEqual(
      ["AUTH_SECRET", "DATABASE_URL", "S3_ACCESS_KEY"].sort(),
    );
  });
});

/*
 * T-018 D11: env renderer di app/worker — opsional, tapi URL dan secret wajib bersama; secret ≥ 32 dan
 * ikut pemeriksaan placeholder; APP_INTERNAL_URL http tidak boleh ber-TLD HSTS preload (probe: Chromium
 * memaksa https lalu gagal).
 */
describe("env renderer PDF (T-018)", () => {
  const SECRET = "r".repeat(43); // nilai uji

  it("opsional; default RENDER_TIMEOUT_MS 60 s dan PDF_MAX_BYTES 25 MB", () => {
    const e = parseEnv(valid);
    expect(e.RENDERER_URL).toBeUndefined();
    expect(e.RENDERER_SECRET).toBeUndefined();
    expect(e.RENDER_TIMEOUT_MS).toBe(60_000);
    expect(e.PDF_MAX_BYTES).toBe(25 * 1024 * 1024);
    const full = parseEnv({
      ...valid,
      RENDERER_URL: "http://127.0.0.1:3200",
      RENDERER_SECRET: SECRET,
      APP_INTERNAL_URL: "http://localhost:3100",
      RENDER_TIMEOUT_MS: "90000",
    });
    expect(full.RENDERER_URL).toBe("http://127.0.0.1:3200");
    expect(full.RENDER_TIMEOUT_MS).toBe(90_000);
  });

  it("URL tanpa secret (atau sebaliknya) dan secret pendek ditolak", () => {
    expect(() => parseEnv({ ...valid, RENDERER_URL: "http://127.0.0.1:3200" })).toThrow(
      /RENDERER_URL dan RENDERER_SECRET/,
    );
    expect(() => parseEnv({ ...valid, RENDERER_SECRET: SECRET })).toThrow(
      /RENDERER_URL dan RENDERER_SECRET/,
    );
    expect(() =>
      parseEnv({ ...valid, RENDERER_URL: "http://127.0.0.1:3200", RENDERER_SECRET: "pendek" }),
    ).toThrow(/RENDERER_SECRET/);
    expect(() => parseEnv({ ...valid, RENDER_TIMEOUT_MS: "100" })).toThrow(/RENDER_TIMEOUT_MS/);
  });

  it("APP_INTERNAL_URL http dengan host app/dev (TLD HSTS preload) ditolak; web/dashboard/localhost/https boleh", () => {
    for (const bad of [
      "http://app:3000",
      "http://dev:3000",
      "http://renderer.app",
      "http://x.dev:80",
    ]) {
      expect(isHstsPreloadedHttp(bad), bad).toBe(true);
      expect(() => parseEnv({ ...valid, APP_INTERNAL_URL: bad }), bad).toThrow(/APP_INTERNAL_URL/);
    }
    for (const ok of [
      "http://web:3000",
      "http://dashboard:3000",
      "http://data-dashboard-app:3000",
      "http://localhost:3100",
      "https://app.dev",
    ]) {
      expect(isHstsPreloadedHttp(ok), ok).toBe(false);
      expect(() => parseEnv({ ...valid, APP_INTERNAL_URL: ok }), ok).not.toThrow();
    }
  });

  it("RENDERER_SECRET berpenanda change-me (placeholder) terdeteksi dan menolak start produksi", () => {
    const placeholder = "change-me-renderer-secret-min-32-chars";
    const env = { ...valid, RENDERER_URL: "http://renderer:3200", RENDERER_SECRET: placeholder };
    expect(findPlaceholderVars(env)).toEqual(["RENDERER_SECRET"]);
    expect(() =>
      parseEnv({
        ...env,
        NODE_ENV: "production",
        APP_URL: "https://dashboard.pcpexpress.com",
        TRUST_PROXY: "true",
      }),
    ).toThrow(/RENDERER_SECRET/);
  });
});
