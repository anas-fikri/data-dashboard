import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-7psf: Admin › Backup — validasi isian target off-VM, file konfigurasi (600, secret tidak pernah keluar),
 * status dari service backup → peringatan admin, dan pemetaan galat tes koneksi.
 */
const ctx = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/env", () => ({ env: () => ({ BACKUP_CONFIG_DIR: ctx.dir }) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/features/audit/service", () => audit);
const probe = vi.hoisted(() => ({ probeOffsite: vi.fn(async (): Promise<string | null> => null) }));
vi.mock("@/features/backup/probe", () => probe);

const config = await import("@/features/backup/config");
const service = await import("@/features/backup/service");
const { probeMessage } =
  await vi.importActual<typeof import("@/features/backup/probe")>("@/features/backup/probe");

const SECRET = "dummy-target-secret-uji";
const ACTOR = { id: "admin1", email: "admin@pcpexpress.com" };
const input = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  endpoint: "http://10.3.3.50:9000/",
  bucket: "backup-data-dashboard",
  prefix: "/data-dashboard/",
  region: "",
  accessKeyId: "dashboard-backup",
  secretAccessKey: SECRET,
  ...over,
});

beforeEach(() => {
  ctx.dir = mkdtempSync(join(tmpdir(), "dd-backup-cfg-"));
  vi.clearAllMocks();
});
afterEach(() => rmSync(ctx.dir, { recursive: true, force: true }));

describe("parseOffsite", () => {
  it("menormalkan endpoint, folder, dan region bawaan", () => {
    const r = config.parseOffsite(input());
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({
        endpoint: "http://10.3.3.50:9000",
        prefix: "data-dashboard",
        region: "us-east-1",
      }),
    });
    expect(config.parseOffsite(input({ prefix: " / " }))).toMatchObject({
      ok: true,
      data: { prefix: "" },
    });
  });

  it.each([
    ["endpoint", "ftp://nas:21"],
    ["endpoint", "https://admin:pw@nas:9000"],
    ["endpoint", "https://nas:9000/bucket"],
    ["endpoint", "http://exa\nmple.com"],
    ["bucket", "Backup_Data"],
    ["prefix", "data/../lain"],
    ["prefix", "data dashboard"],
    ["region", "US EAST"],
    ["accessKeyId", "kunci dengan spasi"],
    ["secretAccessKey", "baris\nbaru"],
  ])("menolak %s = %j dengan nama kolomnya", (field, value) => {
    expect(config.parseOffsite(input({ [field]: value }))).toMatchObject({ ok: false, field });
  });
});

describe("backupAlert", () => {
  const base = {
    state: "ok" as const,
    target: "nas/b",
    pending: 0,
    pendingSince: null,
    lastBackupAt: new Date().toISOString(),
    lastBackupOk: true,
    lastArchive: "dashboard-x.tar.age",
    lastSizeBytes: 10,
    lastOffsiteOkAt: null,
    error: null,
    updatedAt: new Date().toISOString(),
  };

  it("normal → tanpa peringatan; belum ada status → tanpa peringatan", () => {
    expect(config.backupAlert(base)).toBeNull();
    expect(config.backupAlert(null)).toBeNull();
    expect(config.backupAlert({ ...base, state: "off" })).toBeNull();
  });

  it("gagal, > 26 jam, dan tertunda → peringatan dengan nada yang sesuai", () => {
    expect(config.backupAlert({ ...base, state: "failed", lastBackupOk: false })).toMatchObject({
      tone: "error",
      text: "Backup terakhir gagal.",
    });
    expect(config.backupAlert({ ...base, state: "failed" })).toMatchObject({
      tone: "error",
      text: expect.stringContaining("off-VM tidak bisa dijalankan"),
    });
    const old = new Date(Date.now() - 27 * 3600_000).toISOString();
    expect(config.backupAlert({ ...base, lastBackupAt: old })).toMatchObject({
      tone: "error",
      text: expect.stringContaining("26 jam"),
    });
    expect(config.backupAlert({ ...base, state: "pending", pending: 3 })).toMatchObject({
      tone: "warning",
      text: expect.stringContaining("3 arsip"),
    });
  });
});

describe("status.json dari service backup", () => {
  it("dibaca apa adanya; file rusak atau tidak ada → null", async () => {
    expect(await config.readStatus()).toBeNull();
    writeFileSync(
      join(ctx.dir, "status.json"),
      JSON.stringify({
        state: "pending",
        pending: 2,
        target: "nas/b",
        updatedAt: "2026-10-18T00:00:00Z",
        notified: "pending",
      }),
    );
    expect(await config.readStatus()).toMatchObject({
      state: "pending",
      pending: 2,
      lastBackupAt: null,
    });
    writeFileSync(join(ctx.dir, "status.json"), "{rusak");
    expect(await config.readStatus()).toBeNull();
  });
});

describe("saveOffsite / testOffsite", () => {
  it("menyimpan offsite.json 600 untuk backup.sh; secret tidak kembali ke browser, log, atau audit", async () => {
    const r = await service.saveOffsite(ACTOR, input(), "10.0.0.1");
    expect(r).toMatchObject({
      ok: true,
      data: { hasSecret: true, bucket: "backup-data-dashboard" },
    });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const file = join(ctx.dir, "app/offsite.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
      enabled: true,
      endpoint: "http://10.3.3.50:9000",
      secretAccessKey: SECRET,
      updatedBy: ACTOR.email,
    });
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    const entry = (audit.recordAudit.mock.calls[0] as unknown[])[1];
    expect(entry).toMatchObject({
      actorId: ACTOR.id,
      action: "backup.target.update",
      targetType: "system",
      meta: { enabled: true, secretChanged: true },
      ip: "10.0.0.1",
    });
    expect(JSON.stringify(entry)).not.toContain(SECRET);
  });

  it("secret dikosongkan → secret tersimpan dipakai (simpan dan tes); belum ada secret → ditolak", async () => {
    expect(await service.saveOffsite(ACTOR, input({ secretAccessKey: "" }), "ip")).toMatchObject({
      ok: false,
      field: "secretAccessKey",
    });
    await service.saveOffsite(ACTOR, input(), "ip");
    const r = await service.saveOffsite(
      ACTOR,
      input({ secretAccessKey: "", bucket: "lain-bucket" }),
      "ip",
    );
    expect(r).toMatchObject({ ok: true, data: { bucket: "lain-bucket", hasSecret: true } });
    expect(
      JSON.parse(readFileSync(join(ctx.dir, "app/offsite.json"), "utf8")).secretAccessKey,
    ).toBe(SECRET);
    expect((audit.recordAudit.mock.calls[1] as unknown[])[1]).toMatchObject({
      meta: { secretChanged: false },
    });

    probe.probeOffsite.mockResolvedValueOnce("Bucket tidak ditemukan.");
    expect(await service.testOffsite(input({ secretAccessKey: "" }))).toEqual({
      ok: false,
      code: "UNAVAILABLE",
      message: "Bucket tidak ditemukan.",
    });
    expect(probe.probeOffsite).toHaveBeenCalledWith(
      expect.objectContaining({ secretAccessKey: SECRET }),
    );
    expect(await service.testOffsite(input())).toEqual({ ok: true, data: null });
  });

  it("folder konfigurasi tidak bisa ditulis → pesan untuk pengelola server, tanpa audit", async () => {
    const blocker = join(ctx.dir, "bukan-folder");
    writeFileSync(blocker, "");
    ctx.dir = blocker;
    const r = await service.saveOffsite(ACTOR, input(), "ip");
    expect(r).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe("probeMessage", () => {
  it.each([
    [{ name: "NoSuchBucket" }, "Bucket tidak ditemukan"],
    [{ name: "InvalidAccessKeyId" }, "Access key atau secret ditolak"],
    [{ Code: "SignatureDoesNotMatch" }, "Access key atau secret ditolak"],
    [{ name: "AccessDenied" }, "tidak punya hak"],
    [{ name: "Error", cause: { code: "ECONNREFUSED" } }, "Tidak bisa terhubung"],
    [{ name: "TimeoutError" }, "Tidak bisa terhubung"],
    [{ name: "Error", code: "DEPTH_ZERO_SELF_SIGNED_CERT" }, "Sertifikat TLS"],
    [{ name: "Aneh" }, "Tes gagal (Aneh)"],
  ])("%j → %s", (err, text) => {
    expect(probeMessage(err)).toContain(text);
  });
});
