import { IconEyeOff } from "@tabler/icons-react";
import type { ColumnType } from "@/features/ingest/infer";
import { cn } from "@/lib/utils";
import { TYPE_LABEL, fmtInt } from "./labels";

/*
 * 50 baris sampel hasil konversi (T-008 AC 2): nilai ditampilkan seperti yang akan dipakai dashboard
 * (angka format Indonesia, tanggal terbaca, kosong ditandai). Wilayah gulir bisa difokus keyboard;
 * kolom nomor baris dan judul menempel.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad = (n: number) => String(n).padStart(2, "0");

function formatDate(iso: string, withTime: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const d = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return withTime && m[4] ? `${d} ${m[4]}.${m[5]}${m[6] !== "00" ? `.${m[6]}` : ""}` : d;
}

function display(v: unknown, type: ColumnType): string | null {
  if (v === null || v === undefined) return null;
  if (type === "boolean") return v ? "Ya" : "Tidak";
  if (type === "date" || type === "timestamp") return formatDate(String(v), type === "timestamp");
  if (type === "duration" && typeof v === "number") {
    const s = Math.abs(Math.round(v));
    return `${v < 0 ? "-" : ""}${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }
  if (typeof v === "number") return v.toLocaleString("id-ID", { maximumFractionDigits: 6 });
  return String(v);
}

const numeric = (t: ColumnType) => t === "integer" || t === "decimal" || t === "duration";

export function SampleTable({
  columns,
  rows,
  totalColumns,
}: {
  columns: { pos: number; name: string; type: ColumnType; hidden: boolean }[];
  rows: unknown[][];
  totalColumns: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="region"
        aria-label={`Contoh ${fmtInt(rows.length)} baris pertama`}
        // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1, axe
        // scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="max-h-[28rem] overflow-auto rounded-md border"
        data-testid="sample-table"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 border-b border-r bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                Baris
              </th>
              {columns.map((c) => (
                <th
                  key={c.pos}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 max-w-[16rem] border-b bg-card px-3 py-2 align-bottom font-medium",
                    numeric(c.type) ? "text-right" : "text-left",
                  )}
                >
                  <span className="block truncate" title={c.name}>
                    {c.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    {TYPE_LABEL[c.type]}
                    {c.hidden ? (
                      <>
                        <IconEyeOff size={12} stroke={2} aria-hidden />
                        <span>disembunyikan</span>
                      </>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="hover:bg-accent/60">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-r bg-card px-3 py-1.5 text-left font-normal tabular-nums text-muted-foreground"
                >
                  {fmtInt(Number(r[0]))}
                </th>
                {columns.map((c, i) => {
                  const text = display(r[i + 1], c.type);
                  return (
                    <td
                      key={c.pos}
                      className={cn(
                        "max-w-[16rem] truncate border-b px-3 py-1.5",
                        numeric(c.type) && "text-right tabular-nums",
                        c.hidden && "text-muted-foreground",
                      )}
                      title={text ?? undefined}
                    >
                      {text ?? (
                        <span className="text-muted-foreground" aria-label="kosong">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalColumns > columns.length ? (
        <p className="text-xs text-muted-foreground">
          Menampilkan {fmtInt(columns.length)} kolom pertama dari {fmtInt(totalColumns)}. Semua
          kolom tetap bisa dipakai di dashboard.
        </p>
      ) : null}
    </div>
  );
}
