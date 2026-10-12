import ExcelJS from "exceljs";
import type { Parser, RawValue } from "./types";

/** ExcelJS WorkbookReader (streaming). sharedStrings di-cache di memori (tidak ada opsi spill). */
export const exceljsParser: Parser = {
  name: "exceljs",
  physicalRowNumbers: true,
  async parse(path, _opts, onRow) {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
      sharedStrings: "cache",
      hyperlinks: "ignore",
      styles: "cache",
      worksheets: "emit",
      entries: "emit",
    });
    let sheet = -1;
    for await (const ws of reader) {
      sheet++;
      for await (const row of ws) {
        const r = row as ExcelJS.Row;
        const vals = (r.values as unknown[]).slice(1).map((v): RawValue => {
          if (v === null || v === undefined) return null;
          if (typeof v === "object" && !(v instanceof Date)) {
            const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
            if (o.richText) return o.richText.map((x) => x.text).join("");
            if (o.text !== undefined) return o.text;
            return (o.result as RawValue) ?? null;
          }
          return v as RawValue;
        });
        onRow(sheet, r.number, vals);
      }
    }
  },
};
