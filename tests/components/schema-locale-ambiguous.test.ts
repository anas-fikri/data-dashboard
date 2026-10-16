import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ColumnRow } from "@/components/schema/column-row";
import { draftOf } from "@/components/schema/labels";
import type { ColumnSchema } from "@/features/ingest/infer";

/* T-030: kolom angka yang dibaca US padahal ada angka ribuan id-ID ditandai di editor skema. */
const column: ColumnSchema = {
  pos: 1,
  name: "omzet",
  original: "omzet",
  type: "decimal",
  numberLocale: "us",
  hidden: false,
  nullPct: 0,
  distinctCount: 50,
  castFailCount: 0,
};

const row = (c: ColumnSchema) =>
  renderToStaticMarkup(
    ColumnRow({
      column: c,
      draft: draftOf(c),
      changed: false,
      error: undefined,
      disabled: false,
      onChange: () => {},
    }),
  );

describe("T-030: penanda penulisan angka ambigu", () => {
  it("localeAmbiguous → catatan terlihat di baris kolom; tanpa tanda → tidak ada", () => {
    const html = row({ ...column, localeAmbiguous: true });
    expect(html).toContain('data-testid="locale-ambiguous"');
    expect(html).toContain("Penulisan angka ambigu");
    expect(html).toContain("Pilih Indonesia bila maksudnya ribuan");
    expect(row(column)).not.toContain('data-testid="locale-ambiguous"');
  });
});
