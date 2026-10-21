import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
 * T-023 (upgrade rilis G-6): gerbang deploy/upgrade.sh dengan `docker` tiruan di PATH. Tiruan menjawab
 * psql (SQL dari stdin), pg_dump/pg_restore, migrate, skrip worker, image inspect, dan load; perilaku
 * gagal diatur lewat file penanda di $FAKE. Yang diuji: gerbang tertutup saat kueri error, dump baru
 * setelah app/worker berhenti (hanya selama skema lama), STARTED_AT sekali, tag arsip dicek sebelum load,
 * dan rollback menolak database/tabel yang tidak cocok sebelum membuang apa pun.
 */
const SCRIPT = join(process.cwd(), "deploy/upgrade.sh");
const OLD_TABLES = ["Dataset", "DatasetVersion", "Export", "Sheet", "User", "_prisma_migrations"];

const DOCKER = `#!/usr/bin/env bash
echo "$*" >>"$FAKE/calls.log"
flag() { [ -f "$FAKE/$1" ]; }
if [ "$1" = info ]; then echo "$FAKE"; exit 0; fi
if [ "$1" = tag ]; then exit 0; fi
if [ "$1" = load ]; then cat >/dev/null; echo "Loaded image: dashboard-app:baru"; exit 0; fi
if [ "$1" = inspect ]; then echo "sha256:lama"; exit 0; fi
if [ "$1" = image ]; then
  for a; do last=$a; done
  case "$*" in *"{{.Id}}"*) echo "sha256:$last" ;; esac
  exit 0
fi
[ "$1" = compose ] || exit 0
shift 5   # --env-file .env.prod -f docker-compose.prod.yml
sub=$1; shift
case $sub in
  ps) echo cid; exit 0 ;;
  stop | start | up) exit 0 ;;
  build) echo "build-env IMAGE_TAG=$IMAGE_TAG APP_COMMIT=$APP_COMMIT" >>"$FAKE/calls.log"; exit 0 ;;
esac
# run [--rm] [--no-deps] [-T] [-v host:ctr]... <service> <cmd...>
out=""
while [ $# -gt 0 ]; do
  case $1 in
    --rm | --no-deps | -T) shift ;;
    -v) case $2 in *:/out) out=\${2%%:/out}; out=\${out%%:*} ;; esac; shift 2 ;;
    -e) shift 2 ;;
    *) break ;;
  esac
done
svc=$1; shift
case "$svc:$*" in
  migrate:*) echo "All migrations have been successfully applied."; exit 0 ;;
  worker:*check-segments*) flag segments-fail && { echo "selisih: 1"; exit 1; }; echo "sheets: 1"; exit 0 ;;
  worker:*) echo ok; exit 0 ;;
  backup:pg_restore*) cat "$FAKE/dumplist"; exit 0 ;;
  backup:*pg_dump*)
    for a; do name=$a; done
    echo dump >"$out/$name"; wc -l <"$FAKE/tables" | tr -d ' '; exit 0 ;;
  backup:*psql*)
    sql=$(cat)
    case $sql in
      *'"SegmentTyped" t'*) flag gcn8-error && { echo 'ERROR: column t.headerRow does not exist' >&2; exit 1; }; exit 0 ;;
      *'pg_database_size'*) echo 1000; exit 0 ;;
      *'current_database()'*) cat "$FAKE/dbname"; exit 0 ;;
      *'max(migration_name)'*) cat "$FAKE/migration"; exit 0 ;;
      *'count(*) FROM pg_tables'*) wc -l <"$FAKE/tables" | tr -d ' '; exit 0 ;;
      *'SELECT tablename'*) cat "$FAKE/tables"; exit 0 ;;
      *) echo 0; exit 0 ;;
    esac ;;
esac
exit 0
`;

let root = "";
const app = () => join(root, "app");
const stateDir = () => join(root, "upgrade", "20261020T000000Z");
const state = () => readFileSync(join(stateDir(), "state.env"), "utf8");
const calls = () =>
  existsSync(join(root, "calls.log")) ? readFileSync(join(root, "calls.log"), "utf8") : "";

function lastValue(key: string): string | undefined {
  const lines = state()
    .split("\n")
    .filter((l) => l.startsWith(`${key}=`));
  return lines.at(-1)?.slice(key.length + 1);
}

function run(cmd: string, ...args: string[]) {
  return runWith({}, cmd, ...args);
}

function runWith(extra: Record<string, string>, cmd: string, ...args: string[]) {
  const { IMAGE_TAG: _ignored, APP_COMMIT: _ignored2, ...base } = process.env;
  const r = spawnSync("bash", ["deploy/upgrade.sh", cmd, ...args], {
    cwd: app(),
    encoding: "utf8",
    env: {
      ...base,
      ...extra,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      FAKE: root,
      UPGRADE_DIR: join(root, "upgrade"),
      ROLLBACK_YES: "1",
    },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dd-upgrade-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "docker"), DOCKER);
  chmodSync(join(root, "bin", "docker"), 0o755);
  mkdirSync(join(app(), "deploy"), { recursive: true });
  copyFileSync(SCRIPT, join(app(), "deploy/upgrade.sh"));
  writeFileSync(join(app(), "deploy/deploy.sh"), "exit 1\n");
  writeFileSync(
    join(app(), "docker-compose.prod.yml"),
    "GRID_MAX_CONCURRENCY: 2\nAPP_URL: https://x\n",
  );
  writeFileSync(join(app(), ".env.prod"), "APP_HOST=10.0.0.1:8443\nIMAGE_TAG=baru\n");
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(join(stateDir(), "db-20261020T000000Z.dump"), "dump");
  writeFileSync(
    join(stateDir(), "state.env"),
    [
      "STAMP=20261020T000000Z",
      "OLD_TAG=lama",
      "OLD_MIGRATION=m_lama",
      "OLD_DB=data_dashboard",
      "OLD_IMAGE_WORKER=sha256:lama",
      "BACKUP_ARCHIVE=dashboard-x.tar.age",
      "DB_DUMP=db-20261020T000000Z.dump",
      "PREFLIGHT_AT=1",
      "",
    ].join("\n"),
  );
  writeFileSync(join(root, "dbname"), "data_dashboard\n");
  writeFileSync(join(root, "migration"), "m_lama\n");
  writeFileSync(join(root, "tables"), `${OLD_TABLES.join("\n")}\n`);
  writeFileSync(
    join(root, "dumplist"),
    OLD_TABLES.map((t, i) => `${200 + i}; 1259 1639${i} TABLE public ${t} dashboard`).join("\n") +
      "\n",
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("upgrade.sh migrate", { timeout: 60_000 }, () => {
  it("lulus: dump baru setelah app/worker berhenti menjadi dump rollback", () => {
    const r = run("migrate");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("MIGRASI + PEMERIKSAAN LULUS");
    const dump = lastValue("DB_DUMP")!;
    expect(dump).toMatch(/^db-migrate-\d{8}T\d{6}Z\.dump$/);
    expect(existsSync(join(stateDir(), dump))).toBe(true);
    // Dump diambil setelah stop, sebelum migrasi.
    const log = calls();
    expect(log.indexOf("stop app worker")).toBeLessThan(log.indexOf("pg_dump"));
    expect(log.indexOf("pg_dump")).toBeLessThan(log.indexOf(" migrate"));
  });

  it("kueri T-gcn8 error → gerbang tertutup (bukan '0 baris'), MIGRATED_AT kosong", () => {
    writeFileSync(join(root, "gcn8-error"), "");
    const r = run("migrate");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("GAGAL: kueri error (gerbang tertutup)");
    expect(r.out).not.toMatch(/^\s+0 baris$/m);
    expect(r.out).toContain("pemeriksaan pasca-migrasi gagal");
    expect(lastValue("MIGRATED_AT")).toBe("''");
  });

  it("check-segments exit bukan 0 → gagal", () => {
    writeFileSync(join(root, "segments-fail"), "");
    const r = run("migrate");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("pemeriksaan pasca-migrasi gagal");
  });

  it("diulang setelah skema baru → dump rollback tetap yang lama (skema lama)", () => {
    writeFileSync(join(root, "migration"), "m_baru\n");
    const r = run("migrate");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("dump rollback tetap db-20261020T000000Z.dump");
    expect(lastValue("DB_DUMP")).toBe("db-20261020T000000Z.dump");
    expect(calls()).not.toContain("pg_dump");
  });
});

describe("upgrade.sh status preflight", { timeout: 60_000 }, () => {
  it("preflight yang tidak selesai (tanpa PREFLIGHT_AT) tidak bisa dilanjutkan", () => {
    writeFileSync(join(stateDir(), "state.env"), state().replace("PREFLIGHT_AT=1\n", ""));
    const r = run("migrate");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("belum lulus");
    expect(calls()).toBe("");
  });
});

describe("upgrade.sh start", { timeout: 60_000 }, () => {
  it("STARTED_AT dicatat sekali walau start diulang", () => {
    writeFileSync(join(stateDir(), "state.env"), `${state()}MIGRATED_AT=1\n`);
    expect(run("start").code).toBe(1); // deploy.sh tiruan gagal
    const first = lastValue("STARTED_AT");
    expect(first).toMatch(/^\d+$/);
    spawnSync("sleep", ["1.1"]);
    expect(run("start").code).toBe(1);
    expect(lastValue("STARTED_AT")).toBe(first);
    expect(state().match(/^STARTED_AT=/gm)).toHaveLength(1);
  });
});

describe("upgrade.sh load", { timeout: 60_000 }, () => {
  function archive(tag: string) {
    const dir = join(root, `img-${tag}`);
    mkdirSync(dir);
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify([
        { RepoTags: [`dashboard-app:${tag}`] },
        { RepoTags: [`dashboard-worker:${tag}`] },
      ]),
    );
    const file = join(root, `img-${tag}.tar.gz`);
    spawnSync("bash", ["-c", `tar -C "${dir}" -cf - manifest.json | gzip -1 >"${file}"`]);
    return file;
  }

  it("arsip bertag sama dengan produksi lama ditolak SEBELUM docker load", () => {
    const r = run("load", archive("lama"));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("tag produksi lama");
    expect(calls()).not.toMatch(/^load/m);
  });

  it("arsip bertag baru dimuat dan IMAGE_TAG diganti", () => {
    writeFileSync(join(app(), ".env.prod"), "APP_HOST=10.0.0.1:8443\nIMAGE_TAG=lama\n");
    const r = run("load", archive("baru"));
    expect(r.code, r.out).toBe(0);
    expect(calls()).toMatch(/^load/m);
    expect(readFileSync(join(app(), ".env.prod"), "utf8")).toContain("IMAGE_TAG=baru");
  });
});

describe("upgrade.sh rollback", { timeout: 60_000 }, () => {
  it("nama database beda dari preflight → berhenti sebelum stop/drop", () => {
    writeFileSync(join(root, "dbname"), "db_lain\n");
    const r = run("rollback");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("≠ database preflight");
    expect(calls()).not.toContain("stop app worker");
    expect(readdirSync(stateDir())).not.toContain("rollback-drop.sql");
  });

  it("tabel yang tidak ada di dump maupun rilis ini → berhenti", () => {
    writeFileSync(join(root, "tables"), `${[...OLD_TABLES, "Segment", "TabelAsing"].join("\n")}\n`);
    const r = run("rollback");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("TabelAsing");
    expect(calls()).not.toContain("stop app worker");
  });

  it("tabel lama + tabel baru rilis lolos pemeriksaan tujuan", () => {
    writeFileSync(
      join(root, "tables"),
      `${[...OLD_TABLES, "Segment", "SheetSegment"].join("\n")}\n`,
    );
    const r = run("rollback");
    expect(r.out).toContain("tabel ⊆ dump");
    expect(calls()).toContain("stop app worker");
  });
});

describe("upgrade.sh build (T-066: tag bawaan v<versi package.json>)", { timeout: 60_000 }, () => {
  function pkg(version: string) {
    writeFileSync(
      join(app(), "package.json"),
      `{\n  "name": "data-dashboard",\n  "version": "${version}",\n  "dependencies": {\n    "x": "1.0.0"\n  }\n}\n`,
    );
  }
  const envTag = () =>
    /^IMAGE_TAG=(.*)$/m.exec(readFileSync(join(app(), ".env.prod"), "utf8"))?.[1];

  it("tanpa IMAGE_TAG: build bertag v<versi> dan IMAGE_TAG di .env.prod diisi tag itu", () => {
    pkg("1.2.0");
    const r = run("build");
    expect(r.code, r.out).toBe(0);
    expect(calls()).toContain("build-env IMAGE_TAG=v1.2.0 ");
    expect(envTag()).toBe("v1.2.0");
    expect(lastValue("NEW_TAG")).toBe("v1.2.0");
  });

  it("IMAGE_TAG eksplisit menang atas versi package.json", () => {
    pkg("1.2.0");
    const r = runWith({ IMAGE_TAG: "v1.2.0-hotfix1" }, "build");
    expect(r.code, r.out).toBe(0);
    expect(calls()).toContain("build-env IMAGE_TAG=v1.2.0-hotfix1 ");
    expect(envTag()).toBe("v1.2.0-hotfix1");
  });

  it("versi belum dinaikkan (tag = produksi) → ditolak sebelum build, .env.prod tidak berubah", () => {
    pkg("1.0.0");
    writeFileSync(join(stateDir(), "state.env"), state().replace("OLD_TAG=lama", "OLD_TAG=v1.0.0"));
    const r = run("build");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("sama dengan produksi");
    expect(calls()).not.toContain("build-env");
    expect(envTag()).toBe("baru");
  });

  it("tag cadangan rollback prev-* ditolak", () => {
    pkg("1.2.0");
    const r = runWith({ IMAGE_TAG: "prev-20261020T000000Z" }, "build");
    expect(r.code, r.out).toBe(1);
    expect(calls()).not.toContain("build-env");
  });

  it("versi package.json tidak sah sebagai tag → berhenti dengan petunjuk IMAGE_TAG", () => {
    pkg("1.2.0+build.5");
    const r = run("build");
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("IMAGE_TAG=<tag>");
    expect(calls()).not.toContain("build-env");
  });
});
