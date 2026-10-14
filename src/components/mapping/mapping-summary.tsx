import { fmtInt } from "@/components/schema/labels";

/**
 * Ringkasan masalah semua sheet + kemajuan keputusan. Kemajuan diumumkan sopan (aria-live) setiap
 * kali satu keputusan dibuat; batang kemajuan hanya visual (angkanya sudah dibacakan). Selama panel
 * tinjau tampil, ringkasan tidak menyatakan kolomnya "sudah cocok" (isunya bisa di sheet lain).
 */
export function MappingSummary({
  missing,
  lowCast,
  hidden,
  sheets,
  done,
  total,
  reviewing = false,
}: {
  missing: number;
  lowCast: number;
  hidden: number;
  /** Sheet aktif yang tidak ada di file baru. */
  sheets: number;
  done: number;
  total: number;
  /** Panel tinjau sedang tampil. */
  reviewing?: boolean;
}) {
  const facts = [
    ["Kolom tidak ditemukan", missing],
    ...(sheets > 0 ? [["Sheet tidak ditemukan", sheets] as const] : []),
    ["Nilai tidak cocok tipe", lowCast],
    ["Kolom baru (disembunyikan)", hidden],
  ] as const;
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  return (
    <section
      aria-labelledby="mapping-summary-title"
      data-testid="mapping-summary"
      className="flex flex-col gap-3"
    >
      <h2 id="mapping-summary-title" className="sr-only">
        Ringkasan
      </h2>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-md border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-base font-semibold tabular-nums">{fmtInt(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1.5">
        <p role="status" aria-live="polite" className="text-sm" data-testid="mapping-progress">
          {total > 0 ? (
            <>
              <span className="font-medium tabular-nums">
                {fmtInt(done)} dari {fmtInt(total)}
              </span>{" "}
              diputuskan
            </>
          ) : lowCast > 0 || reviewing ? (
            "Tidak ada kolom yang perlu dipilih; tinjau tipe kolom lalu simpan."
          ) : (
            // Skema aktif berubah sejak ingest sehingga kini cocok: cukup simpan.
            "Kolom file baru sudah cocok dengan skema aktif; simpan untuk mengaktifkan versi ini."
          )}
        </p>
        {total > 0 ? (
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
