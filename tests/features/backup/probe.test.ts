import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprint } from "@/features/backup/config";
import { hostKeyLine, probeOffsite } from "@/features/backup/probe";
import { startFakeSftp, type FakeSftp } from "../../stubs/sftp-server";

/*
 * T-y8qq: tes koneksi NAS lewat SFTP sungguhan (server tiruan di proses yang sama): tulis/baca/hapus di
 * folder tujuan, kunci host dikembalikan untuk dipin, kunci lain ditolak sebelum password terkirim, dan
 * galat umum (password, folder, izin, jaringan) jadi pesan yang bisa ditindak.
 */
const PASSWORD = "dummy-nas-password-uji";
let root = "";
let nas: FakeSftp;

const cfg = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  host: "127.0.0.1",
  port: nas.port,
  username: "dashboard-backup",
  password: PASSWORD,
  folder: "/backup-data-dashboard",
  hostKey: "",
  ...over,
});

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-sftp-"));
  mkdirSync(join(root, "backup-data-dashboard"));
  mkdirSync(join(root, "hanya-baca"));
  chmodSync(join(root, "hanya-baca"), 0o555);
  nas = await startFakeSftp({ root, username: "dashboard-backup", password: PASSWORD });
});
afterAll(async () => {
  await nas.close();
  chmodSync(join(root, "hanya-baca"), 0o755);
  rmSync(root, { recursive: true, force: true });
});

describe("probeOffsite", () => {
  it("berhasil → kunci host NAS dikembalikan, file uji dihapus lagi", async () => {
    const r = await probeOffsite(cfg());
    expect(r).toEqual({ ok: true, hostKey: nas.hostKey });
    expect(readdirSync(join(root, "backup-data-dashboard"))).toEqual([]);
    // Dengan kunci yang dipin: tetap berhasil.
    expect(await probeOffsite(cfg({ hostKey: nas.hostKey }))).toEqual({
      ok: true,
      hostKey: nas.hostKey,
    });
  });

  it("kunci host berbeda dari yang dipin → ditolak sebelum password dikirim, sidik jari baru disebut", async () => {
    const other = await startFakeSftp({ root, username: "dashboard-backup", password: PASSWORD });
    try {
      const r = await probeOffsite(cfg({ port: other.port, hostKey: nas.hostKey }));
      expect(r).toMatchObject({
        ok: false,
        message: expect.stringContaining("Kunci host NAS berbeda"),
      });
      expect((r as { message: string }).message).toContain(fingerprint(other.hostKey));
      expect(other.stats.passwordAttempts).toBe(0);
    } finally {
      await other.close();
    }
  });

  it.each([
    ["password salah", { password: "salah" }, "Username atau password ditolak"],
    ["folder tidak ada", { folder: "/tidak-ada" }, "Folder /tidak-ada tidak ditemukan"],
    ["folder tanpa izin tulis", { folder: "/hanya-baca" }, "tidak punya izin menulis file uji"],
    ["port tertutup", { port: 1 }, "Tidak bisa terhubung ke NAS"],
  ])("%s → pesan yang bisa ditindak", async (_n, over, text) => {
    const r = await probeOffsite(cfg(over));
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining(text) });
    expect(JSON.stringify(r)).not.toContain(PASSWORD);
  });

  it("login diterima tetapi subsistem SFTP ditolak (SFTP mati / akun tanpa hak) → sebut port + hak akun", async () => {
    const dsm = await startFakeSftp({
      root,
      username: "dashboard-backup",
      password: PASSWORD,
      denySftp: true,
    });
    try {
      const r = await probeOffsite(cfg({ port: dsm.port }));
      expect(r).toMatchObject({
        ok: false,
        message: expect.stringContaining("menolak SFTP untuk akun atau port ini"),
      });
      expect((r as { message: string }).message).toContain("Hak Istimewa Aplikasi");
    } finally {
      await dsm.close();
    }
  });

  it("NAS menjawab FAILURE (kode 4) saat menghapus → langkah + pesan NAS disebut", async () => {
    const dsm = await startFakeSftp({
      root,
      username: "dashboard-backup",
      password: PASSWORD,
      fail: "REMOVE",
    });
    try {
      const r = await probeOffsite(cfg({ port: dsm.port }));
      expect(r).toMatchObject({
        ok: false,
        message: expect.stringContaining(
          "NAS menolak saat menghapus file uji (kode SFTP 4: Failure)",
        ),
      });
    } finally {
      await dsm.close();
      for (const f of readdirSync(join(root, "backup-data-dashboard")))
        rmSync(join(root, "backup-data-dashboard", f));
    }
  });

  it("DSM ketat (folder ber-ACL: atribut izin & waktu ditolak) → tes tetap berhasil, tanpa file sisa", async () => {
    const dsm = await startFakeSftp({
      root,
      username: "dashboard-backup",
      password: PASSWORD,
      strictAttrs: true,
    });
    try {
      expect(await probeOffsite(cfg({ port: dsm.port }))).toEqual({
        ok: true,
        hostKey: dsm.hostKey,
      });
      expect(readdirSync(join(root, "backup-data-dashboard"))).toEqual([]);
    } finally {
      await dsm.close();
    }
  });

  it("file uji tidak tertinggal di folder tanpa izin tulis", () => {
    expect(existsSync(join(root, "hanya-baca"))).toBe(true);
    expect(readdirSync(join(root, "hanya-baca"))).toEqual([]);
  });
});

describe("hostKeyLine / fingerprint", () => {
  it("blob kunci → baris known_hosts + sidik jari SHA256 ala OpenSSH", () => {
    const blob = Buffer.from(nas.hostKey.split(" ")[1]!, "base64");
    expect(hostKeyLine(blob)).toBe(nas.hostKey);
    expect(fingerprint(nas.hostKey)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });
});
