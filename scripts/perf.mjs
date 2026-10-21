#!/usr/bin/env node
// Titik masuk skenario performa (keputusan D9). Tidak pernah dijalankan oleh `npm run check`.
// Skenario lain masih dijalankan langsung (`npx tsx scripts/perf-*.ts`, lihat docs/ai/perf/).
import { spawnSync } from "node:child_process";

const scenario = process.argv[2];
/** Skenario → skrip tsx (argumen sisanya diteruskan). */
const scenarios = {
  // "Lihat data" (T-041/T-042/T-061): jendela baris, urut/saring/cari/periode, beban + widget.
  grid: "scripts/perf-grid.ts",
  // Pivot 4 tingkat × 8 nilai vs 2 × 3 (T-070).
  pivot: "scripts/perf-pivot-levels.ts",
};

if (!scenario || !(scenario in scenarios)) {
  console.log("Skenario perf tersedia:", Object.keys(scenarios));
  console.log(
    "Pakai: npm run perf -- <skenario> [argumen]. Bukti dicatat di docs/ai/perf/<task>.md",
  );
  process.exit(scenario ? 1 : 0);
}
const r = spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", scenarios[scenario], ...process.argv.slice(3)],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
