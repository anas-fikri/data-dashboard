import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-7psf / T-y8qq: Admin › Backup — validasi isian NAS Synology (SFTP), file konfigurasi (600, password
 * tidak pernah keluar), password tersimpan hanya untuk NAS + akun yang sama, kunci host wajib dari tes
 * koneksi, dan status dari service backup → peringatan admin.
 */
const ctx = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/env", () => ({ env: () => ({ BACKUP_CONFIG_DIR: ctx.dir }) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/features/audit/service", () => audit);
const HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGR1bW15LWhvc3Qta2V5LXVudHVrLXRlcy0wMDAwMDAw";
const probe = vi.hoisted(() => ({
  probeOffsite: vi.fn(
    async (): Promise<{ ok: true; hostKey: string } | { ok: false; message: string }> => ({
      ok: true,
      hostKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGR1bW15LWhvc3Qta2V5LXVudHVrLXRlcy0wMDAwMDAw",
    }),
  ),
}));
vi.mock("@/features/backup/probe", () => probe);

const config = await import("@/features/backup/config");
const service = await import("@/features/backup/service");
const { probeMessage } =
  await vi.importActual<typeof import("@/features/backup/probe")>("@/features/backup/probe");

const SECRET = "dummy-nas-password-uji";
const ACTOR = { id: "admin1", email: "admin@pcpexpress.com" };
const input = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  host: " NAS.PCPEXPRESS.LAN ",
  port: "22",
  username: "dashboard-backup",
  password: SECRET,
  folder: "backup-data-dashboard/",
  hostKey: HOST_KEY,
  ...over,
});
const stored = () => JSON.parse(readFileSync(join(ctx.dir, "app/offsite.json"), "utf8"));

beforeEach(() => {
  ctx.dir = mkdtempSync(join(tmpdir(), "dd-backup-cfg-"));
  vi.clearAllMocks();
});
afterEach(() => rmSync(ctx.dir, { recursive: true, force: true }));

describe("parseOffsite", () => {
  it("menormalkan host, port, dan folder", () => {
    expect(config.parseOffsite(input())).toEqual({
      ok: true,
      data: expect.objectContaining({
        host: "nas.pcpexpress.lan",
        port: 22,
        folder: "/backup-data-dashboard",
      }),
    });
    expect(config.parseOffsite(input({ folder: "/Backup Server/data dashboard" }))).toMatchObject({
      ok: true,
      data: { folder: "/Backup Server/data dashboard" },
    });
    expect(config.parseOffsite(input({ hostKey: "" }))).toMatchObject({ ok: true });
  });

  it.each([
    ["host", "nas pcp"],
    ["host", "-oProxyCommand=x"],
    ["host", "nas\nlain"],
    ["port", "0"],
    ["port", "ssh"],
    ["username", "akun spasi"],
    ["username", ""],
    ["password", "baris\nbaru"],
    ["folder", "/"],
    ["folder", "/data/../lain"],
    ["folder", "/data//lain"],
    ["folder", "/data\n--config"],
    ["hostKey", "ssh-dss AAAAB3NzaC1kc3MAAACBAP"],
    ["hostKey", `${HOST_KEY}\nlain`],
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
  it("menyimpan offsite.json 600 untuk backup.sh; password tidak kembali ke browser, log, atau audit", async () => {
    const r = await service.saveOffsite(ACTOR, input(), "10.0.0.1");
    expect(r).toMatchObject({
      ok: true,
      data: {
        hasPassword: true,
        host: "nas.pcpexpress.lan",
        hostKey: HOST_KEY,
        fingerprint: config.fingerprint(HOST_KEY),
      },
    });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const file = join(ctx.dir, "app/offsite.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(stored()).toMatchObject({
      enabled: true,
      host: "nas.pcpexpress.lan",
      port: 22,
      folder: "/backup-data-dashboard",
      password: SECRET,
      hostKey: HOST_KEY,
      updatedBy: ACTOR.email,
    });
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    const entry = (audit.recordAudit.mock.calls[0] as unknown[])[1];
    expect(entry).toMatchObject({
      actorId: ACTOR.id,
      action: "backup.target.update",
      targetType: "system",
      meta: { enabled: true, hostKey: config.fingerprint(HOST_KEY), passwordChanged: true },
      ip: "10.0.0.1",
    });
    expect(JSON.stringify(entry)).not.toContain(SECRET);
    expect(await config.readOffsite()).toMatchObject({ host: "nas.pcpexpress.lan" });
  });

  it("tanpa kunci host (belum dites) → tidak disimpan", async () => {
    const r = await service.saveOffsite(ACTOR, input({ hostKey: "" }), "ip");
    expect(r).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringContaining("Tes koneksi"),
    });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("password kosong → dipakai ulang hanya untuk NAS, port, dan username yang sama", async () => {
    expect(await service.saveOffsite(ACTOR, input({ password: "" }), "ip")).toMatchObject({
      ok: false,
      field: "password",
      message: "Isi password.",
    });
    await service.saveOffsite(ACTOR, input(), "ip");
    const r = await service.saveOffsite(
      ACTOR,
      input({ password: "", folder: "/lain", enabled: false }),
      "ip",
    );
    expect(r).toMatchObject({
      ok: true,
      data: { folder: "/lain", hasPassword: true, enabled: false },
    });
    expect(stored().password).toBe(SECRET);
    expect((audit.recordAudit.mock.calls[1] as unknown[])[1]).toMatchObject({
      meta: { passwordChanged: false },
    });

    for (const over of [{ host: "nas-lain.lan" }, { port: "2222" }, { username: "akun-lain" }]) {
      expect(await service.testOffsite(input({ ...over, password: "" }))).toMatchObject({
        ok: false,
        field: "password",
        message: expect.stringContaining("isi password lagi"),
      });
    }
    expect(probe.probeOffsite).not.toHaveBeenCalled();

    probe.probeOffsite.mockResolvedValueOnce({
      ok: false,
      message: "Folder /lain tidak ditemukan.",
    });
    expect(await service.testOffsite(input({ password: "" }))).toEqual({
      ok: false,
      code: "UNAVAILABLE",
      message: "Folder /lain tidak ditemukan.",
    });
    expect(probe.probeOffsite).toHaveBeenCalledWith(expect.objectContaining({ password: SECRET }));
    expect(await service.testOffsite(input({ hostKey: "" }))).toEqual({
      ok: true,
      data: { hostKey: HOST_KEY, fingerprint: config.fingerprint(HOST_KEY) },
    });
  });

  it("file lama format S3 → dianggap belum diatur", async () => {
    const dir = join(ctx.dir, "app");
    await import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
    writeFileSync(
      join(dir, "offsite.json"),
      JSON.stringify({
        enabled: true,
        endpoint: "http://x:9000",
        bucket: "b",
        secretAccessKey: "s",
      }),
    );
    expect(await config.readOffsite()).toBeNull();
    expect((await service.getBackupPage()).offsite).toBeNull();
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
  const c = { folder: "/backup", hostKey: "" };
  it.each([
    [{ level: "client-authentication" }, c, "", "Username atau password ditolak"],
    [{ level: "client-timeout" }, c, "", "Tidak bisa terhubung"],
    [{ code: "ENOTFOUND" }, c, "", "Tidak bisa terhubung"],
    [{ message: "closed" }, c, "", "Tidak bisa terhubung"],
    [{ level: "handshake" }, { ...c, hostKey: HOST_KEY }, "", "kunci host NAS tidak cocok"],
    [{ code: 2 }, c, "", "Folder /backup tidak ditemukan"],
    [{ code: 3 }, c, "", "tidak punya izin"],
    [{ level: "aneh" }, c, "", "Tes gagal (aneh)"],
  ])("%j → %s", (err, conf, seen, text) => {
    expect(probeMessage(err, conf, seen)).toContain(text);
  });
});
