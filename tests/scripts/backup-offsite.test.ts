import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
 * T-7psf: deploy/backup.sh sungguhan dengan perintah tiruan di PATH (pg_dump, rclone, age, psql, curl,
 * flock). Target off-VM mati → arsip ditahan di VM, status "pending", email sekali; target hidup lagi →
 * --sync menyalin semua arsip tertunda, status "ok", email pulih; retensi lokal hanya membuang arsip yang
 * sudah tersalin. Rahasia target tidak pernah masuk status atau log.
 */
const SCRIPT = join(process.cwd(), "deploy/backup.sh");
const SECRET = "dummy-target-secret-uji";
const DAY = 24 * 60 * 60 * 1000;

const STUBS: Record<string, string> = {
  pg_dump: `[ -f "$FAKE/pgdown" ] && { echo "pg_dump: koneksi ditolak" >&2; exit 1; }
while [ $# -gt 0 ]; do [ "$1" = --file ] && echo dump >"$2"; shift; done`,
  age: `while [ $# -gt 0 ]; do [ "$1" = -o ] && cat >"$2"; shift; done`,
  flock: "exit 0",
  rclone: `cmd=$1; shift
echo "$cmd $*" >>"$FAKE/rclone.log"
env | grep '^RCLONE_CONFIG_APPOFFSITE_' | sort >"$FAKE/rclone-env.txt"
map() { case $1 in locals3:*) echo "$FAKE/locals3" ;; *:*) echo "$FAKE/remote/\${1#*:}" ;; *) echo "$1" ;; esac; }
case $cmd in
  copy)
    case $2 in *:*)
      [ -f "$FAKE/down" ] && { echo "ERROR : dial tcp 10.0.0.9:9000: i/o timeout" >&2; exit 1; }
      [ -f "$FAKE/down-silent" ] && exit 1 ;;
    esac
    d=$(map "$2"); mkdir -p "$d"
    case $1 in locals3:*) echo obj >"$d/obj" ;; *) cp -p "$1"/dashboard-* "$d/" ;; esac ;;
  delete) [ -f "$FAKE/down" ] && exit 1 ;;
esac
exit 0`,
  psql: `case "$*" in *"SELECT email"*) [ -f "$FAKE/pgdown" ] && exit 2; printf 'a@pcpexpress.com\\nb@pcpexpress.com\\n' ;; esac`,
  curl: `[ -f "$FAKE/smtp-down" ] && exit 7
n=$(ls "$FAKE" | grep -c '^mail-')
cat >"$FAKE/smtp-config-$n.txt"
echo "$*" >"$FAKE/curl-args-$n.txt"
rcpt=""; file=""
while [ $# -gt 0 ]; do
  case $1 in --mail-rcpt) rcpt="$rcpt $2"; shift ;; -T) file=$2; shift ;; esac; shift
done
{ echo "RCPT:$rcpt"; cat "$file"; } >"$FAKE/mail-$n.txt"`,
};

let root = "";
const backups = () => join(root, "backups");
const cfg = () => join(root, "cfg");

function run(...args: string[]) {
  return runWith({}, ...args);
}

function runWith(extra: Record<string, string>, ...args: string[]) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      FAKE: root,
      PGENV_SH: join(root, "pgenv.sh"),
      DATABASE_URL: "postgresql://u:p@db:5432/data_dashboard",
      S3_ENDPOINT: "http://rustfs:9000",
      S3_BUCKET: "dashboard",
      BACKUP_AGE_RECIPIENT: "age1contoh",
      BACKUP_DIR: backups(),
      BACKUP_CONFIG_DIR: cfg(),
      BACKUP_RETENTION_DAYS: "30",
      BACKUP_LOCAL_RETENTION_DAYS: "7",
      SMTP_URL: "smtps://bot%40pcpexpress.com:smtp-pw@mail.pcpexpress.com:465",
      MAIL_FROM: "Data Dashboard <bot@pcpexpress.com>",
      APP_URL: "https://dash.contoh",
      BACKUP_REMOTE: "",
      ...extra,
    },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const status = () => JSON.parse(readFileSync(join(cfg(), "status.json"), "utf8"));
const mails = () =>
  readdirSync(root)
    .filter((f) => f.startsWith("mail-"))
    .sort()
    .map((f) => readFileSync(join(root, f), "utf8"));
const local = () => readdirSync(backups()).filter((f) => f.startsWith("dashboard-"));
const remote = () => {
  const d = join(root, "remote/cadangan-dashboard/data-dashboard");
  return existsSync(d) ? readdirSync(d) : [];
};

/** Arsip lama buatan tangan (nama + umur) — dua backup sungguhan dalam satu detik akan bernama sama. */
function oldArchive(name: string, ageDays: number) {
  const when = new Date(Date.now() - ageDays * DAY);
  for (const f of [name, `${name}.sha256`]) {
    writeFileSync(join(backups(), f), "lama");
    utimesSync(join(backups(), f), when, when);
  }
}

function enableTarget() {
  mkdirSync(join(cfg(), "app"), { recursive: true });
  writeFileSync(
    join(cfg(), "app/offsite.json"),
    JSON.stringify({
      enabled: true,
      endpoint: "http://10.0.0.9:9000",
      bucket: "cadangan-dashboard",
      prefix: "data-dashboard",
      region: "us-east-1",
      accessKeyId: "dashboard-backup",
      secretAccessKey: SECRET,
    }),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dd-backup-"));
  mkdirSync(join(root, "bin"));
  mkdirSync(backups());
  mkdirSync(cfg());
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(root, "bin", name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(root, "bin", name), 0o755);
  }
  writeFileSync(join(root, "pgenv.sh"), "pg_env_from_url() { :; }\nlocal_s3_env() { :; }\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("backup.sh tanpa target off-VM", () => {
  it("arsip dibuat, status off tanpa email, retensi lokal biasa membuang arsip > 7 hari", () => {
    oldArchive("dashboard-20260101T000000Z.tar.age", 10);
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("target off-VM belum diatur");
    expect(local().filter((f) => f.endsWith(".tar.age"))).toHaveLength(1);
    expect(status()).toMatchObject({
      state: "off",
      pending: 0,
      lastBackupOk: true,
      notified: "off",
    });
    expect(mails()).toEqual([]);
  });
});

describe("backup.sh dengan target dari Admin › Backup", () => {
  beforeEach(enableTarget);

  it("target mati → arsip ditahan, pending + email sekali; pulih → --sync menyalin semua + email normal", () => {
    oldArchive("dashboard-20260101T000000Z.tar.age", 10); // belum tersalin: harus bertahan
    oldArchive("dashboard-20251101T000000Z.tar.age", 40); // lewat retensi penuh: dibuang
    writeFileSync(join(root, "down"), "");

    const r1 = run();
    expect(r1.code, r1.out).toBe(0);
    expect(r1.out).toContain("arsip ditahan di VM");
    expect(local()).toContain("dashboard-20260101T000000Z.tar.age");
    expect(local()).not.toContain("dashboard-20251101T000000Z.tar.age");
    const s1 = status();
    expect(s1).toMatchObject({
      state: "pending",
      pending: 2,
      lastBackupOk: true,
      target: "10.0.0.9:9000/cadangan-dashboard/data-dashboard",
      notified: "pending",
    });
    expect(s1.error).toContain("i/o timeout");
    expect(s1.pendingSince).toBeTruthy();
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toContain("RCPT: a@pcpexpress.com b@pcpexpress.com");
    expect(mails()[0]).toContain("Subject: Backup Data Dashboard: salinan off-VM tertunda");
    expect(mails()[0]).toContain("https://dash.contoh/admin/backup");
    // Kredensial target lewat env rclone, URL SMTP (berisi password) lewat stdin curl.
    expect(readFileSync(join(root, "rclone-env.txt"), "utf8")).toContain(
      `RCLONE_CONFIG_APPOFFSITE_SECRET_ACCESS_KEY=${SECRET}`,
    );
    expect(readFileSync(join(root, "smtp-config-0.txt"), "utf8")).toContain("smtp-pw");

    // Masih mati: kirim ulang gagal, tidak ada email kedua.
    const r2 = run("--sync");
    expect(r2.code, r2.out).toBe(0);
    expect(status()).toMatchObject({ state: "pending", pending: 2, pendingSince: s1.pendingSince });
    expect(mails()).toHaveLength(1);

    // Pulih: semua arsip tertunda tersalin, retensi lokal kini membuang arsip 10 hari yang sudah tersalin.
    rmSync(join(root, "down"));
    const r3 = run("--sync");
    expect(r3.code, r3.out).toBe(0);
    expect(r3.out).toContain("2 arsip tertunda tersalin");
    expect(remote()).toContain("dashboard-20260101T000000Z.tar.age");
    expect(remote().filter((f) => f.endsWith(".tar.age"))).toHaveLength(2);
    expect(remote().filter((f) => f.endsWith(".sha256"))).toHaveLength(2);
    expect(local()).not.toContain("dashboard-20260101T000000Z.tar.age");
    expect(local().filter((f) => f.endsWith(".tar.age"))).toHaveLength(1);
    expect(status()).toMatchObject({ state: "ok", pending: 0, pendingSince: null, error: null });
    expect(mails()).toHaveLength(2);
    expect(mails()[1]).toContain("Subject: Backup Data Dashboard kembali normal");

    // Tanpa yang tertunda: --sync tidak menyentuh jaringan.
    const calls = readFileSync(join(root, "rclone.log"), "utf8").split("\n").length;
    expect(run("--sync").code).toBe(0);
    expect(readFileSync(join(root, "rclone.log"), "utf8").split("\n").length).toBe(calls);

    for (const out of [r1.out, r2.out, r3.out]) expect(out).not.toContain(SECRET);
    expect(readFileSync(join(cfg(), "status.json"), "utf8")).not.toContain(SECRET);
  });

  it("email gagal → status tetap tercatat dan pemberitahuan diulang di run berikutnya", () => {
    writeFileSync(join(root, "down"), "");
    writeFileSync(join(root, "smtp-down"), "");
    expect(run().code).toBe(0);
    expect(status()).toMatchObject({ state: "pending", notified: "" });
    rmSync(join(root, "smtp-down"));
    expect(run("--sync").code).toBe(0);
    expect(status()).toMatchObject({ state: "pending", notified: "pending" });
    expect(mails()).toHaveLength(1);
  });

  it("backup gagal (DB tidak terjangkau) → exit ≠ 0, status failed, email ke daftar admin terakhir", () => {
    writeFileSync(join(backups(), ".admins"), "a@pcpexpress.com\n");
    writeFileSync(join(root, "pgdown"), "");
    const r = run();
    expect(r.code).not.toBe(0);
    expect(status()).toMatchObject({
      state: "failed",
      lastBackupOk: false,
      error: "backup gagal di langkah: pg_dump",
      notified: "failed",
    });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toContain("RCPT: a@pcpexpress.com");
    expect(mails()[0]).toContain("Subject: Backup Data Dashboard GAGAL");
    expect(readdirSync(backups()).filter((f) => f.startsWith(".work-"))).toEqual([]);
  });
});

describe("backup.sh: kasus tepi (review T-7psf)", () => {
  it("email: --mail-rcpt-allowfails, Message-ID, badan CRLF", () => {
    enableTarget();
    writeFileSync(join(root, "down"), "");
    expect(run().code).toBe(0);
    expect(readFileSync(join(root, "curl-args-0.txt"), "utf8")).toContain("--mail-rcpt-allowfails");
    const mail = mails()[0]!;
    expect(mail).toMatch(/Message-ID: <[^>]+@pcpexpress\.com>\r\n/);
    const body = mail.split("\r\n\r\n")[1]!;
    expect(body).toContain("\r\n");
    expect(body.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("rclone gagal tanpa pesan (mis. OOM) → arsip tetap tercatat berhasil, status tertunda", () => {
    enableTarget();
    writeFileSync(join(root, "down-silent"), "");
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(status()).toMatchObject({ state: "pending", lastBackupOk: true, pending: 1 });
    const s = run("--sync");
    expect(s.code, s.out).toBe(0);
    expect(status()).toMatchObject({ state: "pending" });
  });

  it("retensi lokal lebih panjang dari retensi penuh → arsip 40 hari tetap ada", () => {
    oldArchive("dashboard-20251101T000000Z.tar.age", 40);
    expect(runWith({ BACKUP_LOCAL_RETENTION_DAYS: "60" }).code).toBe(0);
    expect(local()).toContain("dashboard-20251101T000000Z.tar.age");
  });

  it("offsite.json berupa FIFO → tidak menggantung; status failed + email sekali, tanpa pulih palsu", () => {
    mkdirSync(join(cfg(), "app"), { recursive: true });
    execFileSync("mkfifo", [join(cfg(), "app/offsite.json")]);
    writeFileSync(
      join(cfg(), "status.json"),
      JSON.stringify({ state: "pending", notified: "pending", updatedAt: "x" }),
    );
    const t0 = Date.now();
    const r = runWith({ BACKUP_REMOTE: "offsite:folder" });
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(r.code, r.out).toBe(0);
    expect(status()).toMatchObject({ state: "failed", lastBackupOk: true, notified: "failed" });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toContain("Subject: Backup Data Dashboard GAGAL");
    // BACKUP_REMOTE tidak dipakai selama konfigurasi aplikasi rusak (run harian dan --sync sama).
    expect(runWith({ BACKUP_REMOTE: "offsite:folder" }, "--sync").code).toBe(0);
    expect(status()).toMatchObject({ state: "failed" });
    expect(mails()).toHaveLength(1);
    expect(existsSync(join(root, "remote/folder"))).toBe(false);
  });

  it("offsite.json berupa symlink → ditolak, arsip lama tidak dibuang, galat tampil", () => {
    mkdirSync(join(cfg(), "app"), { recursive: true });
    writeFileSync(
      join(root, "lain.json"),
      JSON.stringify({ enabled: true, endpoint: "http://x", bucket: "b" }),
    );
    symlinkSync(join(root, "lain.json"), join(cfg(), "app/offsite.json"));
    oldArchive("dashboard-20260101T000000Z.tar.age", 10);
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(local()).toContain("dashboard-20260101T000000Z.tar.age");
    expect(status()).toMatchObject({
      state: "failed",
      error: expect.stringContaining("tidak terbaca"),
    });
    expect(readFileSync(join(root, "rclone.log"), "utf8")).not.toContain("appoffsite:");
  });

  it("cadangan daftar admin di folder backup (khusus root), bukan di folder yang bisa ditulis app", () => {
    enableTarget();
    writeFileSync(join(root, "down"), "");
    expect(run().code).toBe(0);
    expect(existsSync(join(backups(), ".admins"))).toBe(true);
    expect(existsSync(join(cfg(), ".admins"))).toBe(false);
    expect(readdirSync(cfg()).filter((f) => f.startsWith(".status."))).toEqual([]);
  });
});
