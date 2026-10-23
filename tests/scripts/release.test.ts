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
 * tiruan di PATH (ssh menjalankan perintah jarak jauh di folder lokal "server"), images.sh dan upgrade.sh
 * tiruan yang mencatat panggilan. Yang diuji: urutan langkah, tag dibuat di commit rilis, berhenti tanpa
 * menyentuh kode server bila preflight gagal, dan --quick meneruskan REUSE_BACKUP_HOURS.
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
  // ssh [-o x]… SERVER [-t] <cmd> → jalankan <cmd> di bash lokal; scp … src SERVER:dst → cp ke /tmp tiruan.
  bin(
    "ssh",
    `while [ "$1" = -o ]; do shift 2; done; shift; [ "$1" = -t ] && shift
echo "ssh: $*" >>"$FAKE/calls.log"; cmd="$*"; cmd=\${cmd// \\/tmp\\// $FAKE/tmp/}; exec bash -c "$cmd"`,
  );
  bin(
    "scp",
    `while [ "$1" = -o ] || [ "$1" = -q ]; do [ "$1" = -o ] && shift; shift; done
mkdir -p "$FAKE/tmp"; echo "scp: $1 -> $2" >>"$FAKE/calls.log"; cp "$1" "$FAKE/tmp/\${2#*:/tmp/}"`,
  );
  bin(
    "docker",
    `echo "docker: $*" >>"$FAKE/calls.log"; [ -f "$FAKE/image-missing" ] && exit 1; exit 0`,
  );
  writeFileSync(
    join(repo(), "deploy/images.sh"),
    `echo "images.sh: $*" >>"$FAKE/calls.log"; [ "$1" = save ] && echo arsip >"$2"; exit 0\n`,
  );
  writeFileSync(
    join(repo(), "deploy/upgrade.sh"),
    `echo "upgrade.sh: $* REUSE=\${REUSE_BACKUP_HOURS:-}" >>"$FAKE/calls.log"
[ "$1" = preflight ] && [ -f "$FAKE/preflight-fail" ] && exit 1; exit 0\n`,
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
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("deploy/release.sh", { timeout: 60_000 }, () => {
  it("urutan lengkap: tag di commit rilis → kirim → preflight → sinkron kode → load/migrate/start", () => {
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
    expect(at("tar -x")).toBeGreaterThan(at("upgrade.sh: preflight"));
    expect(at("upgrade.sh: load")).toBeGreaterThan(at("tar -x"));
    expect(at("upgrade.sh: migrate")).toBeGreaterThan(at("upgrade.sh: load"));
    expect(at("upgrade.sh: start")).toBeGreaterThan(at("upgrade.sh: migrate"));
    expect(readFileSync(join(server(), "package.json"), "utf8")).toContain('"9.9.9"');
    // Image sudah ada di Docker lokal → tanpa build; arsip dibuat lalu dihapus di akhir.
    expect(calls).not.toContain("images.sh: build");
    expect(calls).toContain("images.sh: save");
    expect(existsSync(join(root, "home", "dashboard-v9.9.9.tar.gz"))).toBe(false);
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

  it("--quick meneruskan REUSE_BACKUP_HOURS=26 ke preflight; image belum ada → build", () => {
    writeFileSync(join(root, "image-missing"), "");
    const r = run("--quick");
    expect(r.code, r.out).toBe(0);
    expect(log()).toContain("upgrade.sh: preflight REUSE=26");
    expect(log()).toContain("images.sh: build v9.9.9");
  });

  it("perubahan lokal belum di-commit → berhenti sebelum apa pun dikirim", () => {
    writeFileSync(join(repo(), "lain.txt"), "x");
    const r = run();
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("perubahan lokal");
    expect(log()).toBe("");
  });
});
