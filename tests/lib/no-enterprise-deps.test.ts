import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/*
 * ADR-0007 (T-035): grid "Lihat data" memakai AG Grid Community (MIT) saja. Lint menolak setiap bentuk
 * impor modul Enterprise grid maupun AG Charts Enterprise (statis, subpath, scoped, re-export, import()
 * dinamis, require, termasuk dengan template literal) di semua ekstensi kode, dan lockfile tidak boleh
 * memuat paket Enterprise sama sekali (lint tidak melihat dependensi transitif).
 */
describe("AG Grid Enterprise dilarang (ADR-0007)", () => {
  const eslint = new ESLint();
  const errors = async (code: string, filePath = "src/probe-grid.ts") => {
    const [r] = await eslint.lintText(`${code}\nexport {};\n`, { filePath });
    return r!.messages.filter((m) => m.message.includes("ADR-0007")).length;
  };

  it("lint menolak impor Enterprise dalam bentuk apa pun; Community lolos", async () => {
    for (const code of [
      'import "ag-grid-enterprise";',
      'import { LicenseManager } from "ag-grid-enterprise/dist/main";',
      'import { X } from "@ag-grid-enterprise/core";',
      'import type { GridOptions } from "ag-grid-charts-enterprise";',
      'import { AgCharts } from "ag-charts-enterprise";',
      'import "ag-charts-enterprise/styles";',
      'export { ClipboardModule } from "ag-grid-enterprise";',
      'const m = await import("ag-grid-charts-enterprise");',
      "const m = await import(`ag-grid-enterprise`);",
      'const m = require("ag-grid-enterprise");',
      "const m = require(`@ag-grid-enterprise/clipboard`);",
      "const m = await import(`ag-charts-enterprise`);",
    ])
      expect(await errors(code), code).toBe(1);
    expect(await errors('import { AgGridReact } from "ag-grid-react";')).toBe(0);
    expect(await errors('import { themeQuartz } from "ag-grid-community";')).toBe(0);
    expect(await errors("const m = await import(`ag-grid-community`);")).toBe(0);
  }, 30_000);

  it("aturan berlaku di semua ekstensi kode (.ts .tsx .mts .cts .js .jsx .mjs .cjs)", async () => {
    for (const ext of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"])
      expect(await errors('import "ag-grid-enterprise";', `src/probe-grid.${ext}`), ext).toBe(1);
  }, 30_000);

  it("package-lock.json tanpa paket Enterprise (grid, charts, @ag-grid-enterprise/*)", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, unknown>;
    };
    const bad = Object.keys(lock.packages).filter((k) =>
      /node_modules\/(ag-grid-(charts-)?enterprise|ag-charts-enterprise|@ag-grid-enterprise\/)/.test(
        k,
      ),
    );
    expect(bad).toEqual([]);
  });
});
