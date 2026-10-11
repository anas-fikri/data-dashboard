#!/usr/bin/env node
// Titik masuk skenario performa (keputusan D9). Skenario pertama ditambahkan di T-005.
// Tidak pernah dijalankan oleh `npm run check`.
const scenario = process.argv[2];
const scenarios = {};

if (!scenario || !(scenario in scenarios)) {
  console.log(
    "Skenario perf tersedia:",
    Object.keys(scenarios).length ? Object.keys(scenarios) : "(belum ada)",
  );
  console.log("Pakai: npm run perf -- <skenario>. Bukti dicatat di docs/ai/perf/<task>.md");
  process.exit(scenario ? 1 : 0);
}
