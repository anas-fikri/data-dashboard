#!/usr/bin/env node
// Ukuran chunk rute "Lihat data" (T-043, ADR-0007: ≤ 293 KiB gzip level 6) dari hasil `next build`.
// Pakai: npx next build && node scripts/measure-grid-chunk.mjs
//  - lazy: chunk next/dynamic grid (react-loadable-manifest rute /datasets/[id]/data, berisi AG Grid);
//  - rute: chunk eager rute yang tidak dimuat halaman skema (pembanding rute dataset lain);
//  - dashboard: memastikan chunk berisi AG Grid tidak pernah dirujuk rute dashboard (chunk lazy lain bisa
//    berbagi kode app, mis. menu Radix — itu tidak dihitung bocor).
// Keluar 1 bila total > 293 KiB atau chunk grid ikut rute dashboard.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const NEXT = ".next";
const app = join(NEXT, "server/app/(app)");
const LIMIT_KIB = 293;
if (!existsSync(join(app, "datasets/[id]/data/page/react-loadable-manifest.json"))) {
  console.error("build belum ada: jalankan `npx next build` dulu");
  process.exit(1);
}
const gz = (f) => gzipSync(readFileSync(join(NEXT, f)), { level: 6 }).length;
const kib = (n) => Math.round((n / 1024) * 10) / 10;
const chunksOf = (manifest) =>
  new Set(readFileSync(manifest, "utf8").match(/static\/chunks\/[\w-]+\.(?:js|css)/g) ?? []);

const loadable = JSON.parse(
  readFileSync(join(app, "datasets/[id]/data/page/react-loadable-manifest.json"), "utf8"),
);
const lazy = [...new Set(Object.values(loadable).flatMap((e) => e.files))];
const data = chunksOf(join(app, "datasets/[id]/data/page_client-reference-manifest.js"));
const schema = chunksOf(join(app, "datasets/[id]/skema/page_client-reference-manifest.js"));
const routeOnly = [...data].filter((f) => !schema.has(f) && !lazy.includes(f));
const dash = readFileSync(join(app, "dashboards/[id]/page_client-reference-manifest.js"), "utf8");
const isAg = (f) => /ag-grid-viewport|InfiniteRowModel/.test(readFileSync(join(NEXT, f), "utf8"));
const leaked = lazy.filter((f) => dash.includes(f) && isAg(f));

const lazyGz = lazy.reduce((a, f) => a + gz(f), 0);
const routeGz = routeOnly.reduce((a, f) => a + gz(f), 0);
const out = {
  lazy: lazy.map((f) => ({ f, gzKiB: kib(gz(f)) })),
  routeOnly: routeOnly.map((f) => ({ f, gzKiB: kib(gz(f)) })),
  lazyKiB: kib(lazyGz),
  routeOnlyKiB: kib(routeGz),
  totalKiB: kib(lazyGz + routeGz),
  limitKiB: LIMIT_KIB,
  leakedToDashboard: leaked,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.totalKiB > LIMIT_KIB || leaked.length > 0 ? 1 : 0);
