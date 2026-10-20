import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * T-059 review L2: "satu antrean OPEN per dataset" dijaga indeks unik parsial yang tidak bisa ditulis di
 * schema.prisma. `prisma migrate dev` bisa membuat migrasi yang menghapusnya sebagai drift — uji ini
 * gagal bila indeks hilang dari migrasi T-059 atau dihapus migrasi sesudahnya.
 */
const DIR = join(process.cwd(), "prisma/migrations");
const INDEX = "UploadQueue_datasetId_open_key";
const migrations = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const sql = (name: string) => readFileSync(join(DIR, name, "migration.sql"), "utf8");

describe("indeks unik parsial antrean unggah", () => {
  it("dibuat migrasi T-059 hanya untuk status OPEN", () => {
    expect(sql("20261021100000_t059_upload_queue")).toMatch(
      new RegExp(
        `CREATE UNIQUE INDEX "${INDEX}" ON "UploadQueue"\\("datasetId"\\) WHERE "status" = 'OPEN';`,
      ),
    );
  });

  it("tidak dihapus migrasi sesudahnya", () => {
    const after = migrations.filter((m) => m > "20261021100000_t059_upload_queue");
    for (const m of after) expect(sql(m), m).not.toMatch(new RegExp(`DROP INDEX[^;]*${INDEX}`));
  });

  it("schema.prisma mencatat indeks ini (pengingat saat mengubah model)", () => {
    expect(readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8")).toContain(INDEX);
  });
});
