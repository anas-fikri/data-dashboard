import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
 * deploy/release.sh (rilis satu perintah dari Mac): repo git sementara + origin bare, `ssh`/`scp`/`docker`
 * tiruan di PATH (ssh menjalankan perintah jarak jauh di bash lokal, jadi folder sementara "server" dibuat
 * mktemp di /tmp lokal), images.sh dan upgrade.sh tiruan yang mencatat panggilan. Yang diuji: urutan
 * langkah (preflight → load → sinkron kode → migrate/start), tag di commit rilis, build ulang dari worktree
 * tag bila commit image beda, berhenti aman bila preflight/load gagal, dan aturan --quick.
 */
const SCRIPT = join(process.cwd(), "deploy/release.sh");

let root = "";
const repo = () => join(root, "repo");
const server = () => join(root, "server");
const log = () =>
  existsSync(join(root, "calls.log")) ? readFileSync(join(root, "calls.log"), "utf8") : "";
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo(), encoding: "utf8", env: gitEnv() });
const gitEnv = () => ({
  ...process.env,
  GIT_AUTHOR_NAME: "uji",
  GIT_AUTHOR_EMAIL: "uji@example.com",
  GIT_COMMITTER_NAME: "uji",
  GIT_COMMITTER_EMAIL: "uji@example.com",
});

function bin(name: string, body: string) {
  writeFileSync(join(root, "bin", name), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(join(root, "bin", name), 0o755);
}

function run(...args: string[]) {
  const r = spawnSync("bash", ["deploy/release.sh", ...args], {
    cwd: repo(),
    encoding: "utf8",
    env: {
      ...gitEnv(),
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      HOME: join(root, "home"),
      FAKE: root,
      APP_DIR: server(),
    },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dd-release-"));
  for (const d of ["bin", "home", "server", "repo/deploy", "origin.git"]) {
    mkdirSync(join(root, d), { recursive: true });
  }
  execFileSync("git", ["init", "-q", "--bare", join(root, "origin.git")]);
  // ssh [-o x]… SERVER [-t] <cmd> → jalankan <cmd> di bash lokal; scp … src SERVER:dst → cp ke dst.
  bin(
    "ssh",
    `while [ "$1" = -o ]; do shift 2; done; shift; [ "$1" = -t ] && shift
echo "ssh: $*" >>"$FAKE/calls.log"; exec bash -c "$*"`,
  );
  bin(
    "scp",
    `while [ "$1" = -o ] || [ "$1" = -q ]; do [ "$1" = -o ] && shift; shift; done
echo "scp: $1 -> $2" >>"$FAKE/calls.log"; cp "$1" "\${2#*:}"`,
  );
  // image inspect -f … → APP_COMMIT image (isi $FAKE/image-commit); image-missing → image belum ada.
  bin(
    "docker",
    `echo "docker: $*" >>"$FAKE/calls.log"; [ -f "$FAKE/image-missing" ] && exit 1
case "$*" in *Config.Env*) echo "APP_COMMIT=$(cat "$FAKE/image-commit")" ;; esac; exit 0`,
  );
  writeFileSync(
    join(repo(), "deploy/images.sh"),
    `echo "images.sh: $* cwd=\${PWD##*/}" >>"$FAKE/calls.log"; [ "$1" = save ] && echo arsip | gzip >"$2"; exit 0\n`,
  );
  writeFileSync(
    join(repo(), "deploy/upgrade.sh"),
    `echo "upgrade.sh: $* REUSE=\${REUSE_BACKUP_HOURS:-}" >>"$FAKE/calls.log"
[ "$1" = preflight ] && [ -f "$FAKE/preflight-fail" ] && exit 1
[ "$1" = load ] && [ -f "$FAKE/load-fail" ] && exit 1; exit 0\n`,
  );
  copyFileSync(SCRIPT, join(repo(), "deploy/release.sh"));
  writeFileSync(join(repo(), "package.json"), '{\n  "version": "9.9.9"\n}\n');
  writeFileSync(join(server(), "package.json"), '{\n  "version": "9.9.8"\n}\n');
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "chore(release): v9.9.9");
  git("commit", "-q", "--allow-empty", "-m", "Merge PR: rilis");
  git("remote", "add", "origin", join(root, "origin.git"));
  git("push", "-q", "origin", "main");
  // Image lokal sudah dibangun dari commit rilis (HEAD~1 = tag).
  writeFileSync(join(root, "image-commit"), git("rev-parse", "--short", "HEAD~1").trim());
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("deploy/release.sh", { timeout: 60_000 }, () => {
  it("urutan lengkap: tag di commit rilis → kirim → preflight → load → sinkron kode → migrate/start", () => {
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("RILIS v9.9.9 SELESAI");
    // Tag dibuat di commit "chore(release)", bukan di commit merge sesudahnya, dan di-push.
    expect(git("rev-parse", "v9.9.9^{commit}").trim()).toBe(git("rev-parse", "HEAD~1").trim());
    expect(
      execFileSync("git", ["--git-dir", join(root, "origin.git"), "tag"], { encoding: "utf8" }),
    ).toContain("v9.9.9");
    const calls = log();
    const at = (s: string) => calls.indexOf(s);
    expect(at("scp:")).toBeGreaterThan(-1);
    expect(at("upgrade.sh: preflight")).toBeGreaterThan(at("scp:"));
    expect(at("upgrade.sh: load")).toBeGreaterThan(at("upgrade.sh: preflight"));
    expect(at("tar -x")).toBeGreaterThan(at("upgrade.sh: load"));
    expect(at("upgrade.sh: migrate")).toBeGreaterThan(at("tar -x"));
    expect(at("upgrade.sh: start")).toBeGreaterThan(at("upgrade.sh: migrate"));
    expect(readFileSync(join(server(), "package.json"), "utf8")).toContain('"9.9.9"');
    // Image sudah ada dari commit tag → tanpa build; arsip dibuat lalu dihapus di akhir.
    expect(calls).not.toContain("images.sh: build");
    expect(calls).toContain("images.sh: save");
    expect(existsSync(join(root, "home", "dashboard-v9.9.9.tar.gz"))).toBe(false);
    // Folder sementara di server dibersihkan.
    expect(calls).toMatch(/ssh: rm -rf \S*dashboard-rilis\./);
  });

  it("image dari commit lain → dibangun ulang dari worktree tag, bukan dari folder kerja", () => {
    writeFileSync(join(root, "image-commit"), "deadbee");
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(log()).toContain("images.sh: build v9.9.9 cwd=rilis-v9.9.9");
  });

  it("preflight gagal → berhenti, kode server tidak disentuh, tanpa load/migrate", () => {
    writeFileSync(join(root, "preflight-fail"), "");
    const r = run();
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("produksi TIDAK diubah");
    expect(log()).not.toContain("tar -x");
    expect(log()).not.toContain("upgrade.sh: load");
    expect(readFileSync(join(server(), "package.json"), "utf8")).toContain('"9.9.8"');
  });

  it("load gagal → berhenti sebelum sinkron kode, dengan perintah lanjutan manual", () => {
    writeFileSync(join(root, "load-fail"), "");
    const r = run();
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("JANGAN jalankan ulang skrip");
    expect(log()).not.toContain("tar -x");
    expect(log()).not.toContain("upgrade.sh: migrate");
    expect(readFileSync(join(server(), "package.json"), "utf8")).toContain('"9.9.8"');
  });

  it("--quick meneruskan REUSE_BACKUP_HOURS=26 ke preflight; image belum ada → build", () => {
    writeFileSync(join(root, "image-missing"), "");
    const r = run("--quick");
    expect(r.code, r.out).toBe(0);
    expect(log()).toContain("upgrade.sh: preflight REUSE=26");
    expect(log()).toContain("images.sh: build v9.9.9");
  });

  it("--quick ditolak bila rilis berisi migrasi database sejak tag sebelumnya", () => {
    git("tag", "-a", "v9.9.8", "-m", "v9.9.8", "HEAD~1");
    mkdirSync(join(repo(), "prisma/migrations/x"), { recursive: true });
    writeFileSync(join(repo(), "prisma/migrations/x/migration.sql"), "SELECT 1;\n");
    writeFileSync(join(repo(), "package.json"), '{\n  "version": "9.9.10"\n}\n');
    git("add", "-A");
    git("commit", "-q", "-m", "chore(release): v9.9.10");
    git("push", "-q", "origin", "main");
    const r = run("--quick");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("migrasi database");
    expect(log()).not.toContain("upgrade.sh:");
  });

  it("perubahan lokal belum di-commit → berhenti sebelum apa pun dikirim", () => {
    writeFileSync(join(repo(), "lain.txt"), "x");
    const r = run();
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("perubahan lokal");
    expect(log()).toBe("");
  });

  it("--seed hanya menerima slug (tanpa injeksi perintah)", () => {
    const r = run("--seed", "a;touch x");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("--seed hanya slug");
    expect(log()).toBe("");
  });
});
