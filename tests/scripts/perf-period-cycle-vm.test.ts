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
 * T-063: scripts/perf-period-cycle-vm.sh dengan `docker` tiruan di PATH. Tiruan "worker" meniru
 * perf-period-cycle.ts --checkpoints: menulis checkpoint-<titik>.json di /scratch lalu menunggu
 * checkpoint-<titik>.done; tiruan "backup" mencatat backup.sh dan mengembalikan ukuran arsip yang naik.
 * Yang diuji: setiap titik dibackup tepat sekali, sesudah titiknya ditulis dan sebelum siklus lanjut,
 * ukuran arsip masuk backup.tsv dan tanda selesai, hasil disalin, scratch dihapus, hanya project uji.
 */
const SCRIPT = join(process.cwd(), "scripts/perf-period-cycle-vm.sh");

const DOCKER = `#!/usr/bin/env bash
echo "$*" >>"$FAKE/calls.log"
[ "$1" = compose ] || exit 0          # docker ps / stats: tanpa container
shift 7                               # compose -p <p> --env-file <f> -f <f>
[ "$1" = run ] || exit 0
shift
scratch=""
while [ $# -gt 0 ]; do
  case $1 in
    --rm | --no-deps | -T) shift ;;
    --user | -e | --entrypoint | --name) shift 2 ;;
    -v) case $2 in *:/scratch) scratch=\${2%%:/scratch} ;; esac; shift 2 ;;
    *) break ;;
  esac
done
svc=$1; shift
case "$svc:$*" in
  worker:*)
    for p in 0 1 end; do
      echo "{\\"label\\":\\"$p\\",\\"datasetMB\\":1.5,\\"sourceMB\\":0.5}" >"$scratch/checkpoint-$p.json"
      while [ ! -f "$scratch/checkpoint-$p.done" ]; do sleep 0.1; done
      echo "titik $p selesai: $(cat "$scratch/checkpoint-$p.done")"
    done
    echo '{"summary":{}}' >"$scratch/cycle.json"
    exit 0 ;;
  backup:backup.sh) n=$(cat "$FAKE/n" 2>/dev/null || echo 0); echo $((n + 1)) >"$FAKE/n"; exit 0 ;;
  backup:-c*) echo $(( $(cat "$FAKE/n") * 1000 )); exit 0 ;;
esac
exit 1
`;

let root: string;
let fake: string;
let perfDir: string;

function run() {
  return spawnSync("bash", [join(root, "scripts/perf-period-cycle-vm.sh"), join(root, "hasil")], {
    cwd: root,
    env: {
      ...process.env,
      FAKE: fake,
      PERF_DIR: perfDir,
      CHECKPOINTS: "0,1,end",
      PATH: `${fake}:${process.env.PATH}`,
    },
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("perf-period-cycle-vm.sh", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "perf-cycle-vm-"));
    fake = join(root, "fake");
    perfDir = join(root, "perf");
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(fake);
    mkdirSync(perfDir);
    copyFileSync(SCRIPT, join(root, "scripts/perf-period-cycle-vm.sh"));
    writeFileSync(join(root, "scripts/perf-period-cycle.ts"), "");
    writeFileSync(join(root, ".env.perftest"), "APP_HOST=uji:9543\n");
    writeFileSync(join(perfDir, "users.json"), '[{"email":"perf1@contoh.id","password":"x"}]\n');
    writeFileSync(join(fake, "docker"), DOCKER);
    chmodSync(join(fake, "docker"), 0o755);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("backup sungguhan tepat sekali per titik, ukuran arsip tercatat, hasil disalin, scratch dihapus", () => {
    const r = run();
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const tsv = readFileSync(join(root, "hasil/backup.tsv"), "utf8").trim().split("\n");
    expect(tsv.slice(1).map((l) => l.split("\t"))).toEqual([
      ["0", "1.5", "0.5", "1000"],
      ["1", "1.5", "0.5", "2000"],
      ["end", "1.5", "0.5", "3000"],
    ]);
    // Worker menerima ukuran arsip lewat tanda selesai (siklus menunggu backup titiknya).
    expect(readFileSync(join(root, "hasil/cycle.log"), "utf8")).toContain(
      "titik end selesai: 3000",
    );
    expect(existsSync(join(root, "hasil/cycle.json"))).toBe(true);
    expect(existsSync(join(perfDir, "cycle"))).toBe(false);
    const calls = readFileSync(join(fake, "calls.log"), "utf8").trim().split("\n");
    const compose = calls.filter((c) => c.startsWith("compose"));
    // Hanya stack uji terpisah; siklus berjalan dengan NODE_ENV=test dan akun perf pertama.
    expect(compose.every((c) => c.includes("-p dashboard-perftest --env-file .env.perftest"))).toBe(
      true,
    );
    const cycle = compose.find((c) => c.includes("perf-period-cycle.ts --owner"))!;
    expect(cycle).toContain("-e NODE_ENV=test");
    expect(cycle).toContain("--owner perf1@contoh.id");
    expect(cycle).toContain("--checkpoints 0,1,end");
    expect(compose.filter((c) => c.endsWith("backup backup.sh"))).toHaveLength(3);
    // Container siklus bernama; saat keluar (normal/gagal) container itu dibuang.
    const name = /--name (dashboard-perftest-cycle-\d+)/.exec(cycle)![1];
    expect(calls).toContain(`rm -f ${name}`);
  });

  it("tanpa stack uji → berhenti dengan arahan, tanpa memanggil docker compose", () => {
    rmSync(join(root, ".env.perftest"));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("deploy/perf-stack.sh up 1");
    expect(existsSync(join(fake, "calls.log"))).toBe(false);
  });
});
