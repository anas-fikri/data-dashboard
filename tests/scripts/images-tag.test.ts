import { spawnSync } from "node:child_process";
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
 * T-066: deploy/images.sh build memberi tag bawaan v<version package.json>, tag eksplisit menang, dan
 * tidak pernah memindahkan tag yang dipakai container berjalan / menimpa tag rilis yang sudah ada.
 * `docker` tiruan di PATH: `ps` membaca $FAKE/running, `image inspect` sukses bila $FAKE/ada-<ref> ada.
 */
const SCRIPT = join(process.cwd(), "deploy/images.sh");
const DOCKER = `#!/usr/bin/env bash
echo "$*" >>"$FAKE/calls.log"
case "$1" in
  ps) cat "$FAKE/running" 2>/dev/null; exit 0 ;;
  image) for a; do last=$a; done; [ -f "$FAKE/ada-$last" ]; exit ;;
esac
exit 0
`;

let root = "";
const app = () => join(root, "app");
const calls = () =>
  existsSync(join(root, "calls.log")) ? readFileSync(join(root, "calls.log"), "utf8") : "";

function run(args: string[], extra: Record<string, string> = {}) {
  const { IMAGE_TAG: _tag, ...base } = process.env;
  const r = spawnSync("bash", ["deploy/images.sh", ...args], {
    cwd: app(),
    encoding: "utf8",
    env: { ...base, ...extra, PATH: `${join(root, "bin")}:${process.env.PATH}`, FAKE: root },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dd-images-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "docker"), DOCKER);
  chmodSync(join(root, "bin", "docker"), 0o755);
  mkdirSync(join(app(), "deploy"), { recursive: true });
  copyFileSync(SCRIPT, join(app(), "deploy/images.sh"));
  writeFileSync(
    join(app(), "package.json"),
    '{\n  "name": "data-dashboard",\n  "version": "1.1.0",\n  "devDependencies": {\n    "y": "2.0.0"\n  }\n}\n',
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("images.sh build", { timeout: 30_000 }, () => {
  it("tanpa tag: keempat image bertag v<versi package.json>", () => {
    const r = run(["build"]);
    expect(r.code, r.out).toBe(0);
    for (const s of ["app", "worker", "renderer", "backup"]) {
      expect(calls()).toContain(`-t dashboard-${s}:v1.1.0`);
    }
    expect(calls()).toContain("--build-arg APP_COMMIT=");
    expect(r.out).toContain("image bertag v1.1.0 siap");
  });

  it("tag eksplisit (argumen atau IMAGE_TAG) menang", () => {
    expect(run(["build", "uji1"]).code).toBe(0);
    expect(calls()).toContain("-t dashboard-app:uji1");
    expect(run(["build"], { IMAGE_TAG: "uji2" }).code).toBe(0);
    expect(calls()).toContain("-t dashboard-app:uji2");
  });

  it("tag bawaan yang sudah ada di image store tidak ditimpa diam-diam", () => {
    writeFileSync(join(root, "ada-dashboard-app:v1.1.0"), "");
    const r = run(["build"]);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("naikkan versi");
    expect(calls()).not.toContain("buildx");
  });

  it("tag yang dipakai container berjalan ditolak, juga bila eksplisit", () => {
    writeFileSync(join(root, "running"), "caddy:2-alpine\ndashboard-worker:v1.1.0\n");
    for (const args of [["build"], ["build", "v1.1.0"]]) {
      const r = run(args);
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain("dipakai container yang berjalan");
    }
    expect(calls()).not.toContain("buildx");
  });

  it("tag cadangan rollback prev-* ditolak", () => {
    const r = run(["build", "prev-20261020T000000Z"]);
    expect(r.code, r.out).toBe(1);
    expect(calls()).not.toContain("buildx");
  });
});
