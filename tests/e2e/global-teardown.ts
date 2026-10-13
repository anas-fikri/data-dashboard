import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Bersihkan sisa e2e agar disk dev tidak membengkak: data user uji (dataset + objek storage,
 * termasuk unggahan 200 MB), lalu akun uji buatan uniqueEmail (termasuk admin e2e), dan file
 * sementara dd-e2e-* di tmpdir.
 * Set E2E_KEEP_DATA=1 untuk mempertahankan data saat men-debug.
 */
export default function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === "1" || process.env.E2E_BASE_URL) return;
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith("dd-e2e-")) rmSync(join(tmpdir(), name), { recursive: true, force: true });
  }
  const out = execFileSync("node", ["scripts/dev-purge-test-data.mjs"]).toString().trim();
  console.log(`data uji dibersihkan: ${out}`);
}
