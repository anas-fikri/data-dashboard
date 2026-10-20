import { IconCalendarStats, IconTableOptions } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Unggahan data per periode yang menunggu pemetaan (T-057, rencana G-6 §4.9): pemetaan hanya untuk
 * periode di file ini, kolom tambahan menjadi kolom tersembunyi baru, dan tipe kolom diubah dari halaman
 * Skema (recast per segmen) — bukan di sini. `reason` = alasan ingest berhenti (mis. kolom tidak ada,
 * nilai tidak cocok tipe), tampil apa adanya agar pemilik tahu apa yang perlu diputuskan.
 */
export function MappingPeriodNotice({
  datasetId,
  reason,
}: {
  datasetId: string;
  reason: string | null;
}) {
  return (
    <section
      aria-labelledby="mapping-period-title"
      data-testid="mapping-period-notice"
      className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 text-sm md:flex-row md:items-start md:justify-between md:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="mapping-period-title" className="flex items-center gap-2 font-semibold">
          <IconCalendarStats size={20} stroke={1.5} aria-hidden className="shrink-0" />
          Data per periode
        </h2>
        <p>
          Pemetaan hanya berlaku untuk periode di file ini; periode lama tidak berubah dan tidak
          diproses ulang. Kolom tambahan di file disimpan sebagai kolom tersembunyi baru.
        </p>
        <p>Tipe kolom tidak bisa diubah di sini. Ubah tipe dari halaman Skema bila perlu.</p>
        {reason ? (
          <p
            className="text-muted-foreground [overflow-wrap:anywhere]"
            data-testid="mapping-reason"
          >
            Alasan: {reason}
          </p>
        ) : null}
      </div>
      <Button
        asChild
        variant="outline"
        className="h-(--control-h-lg) w-full shrink-0 md:h-(--control-h) md:w-auto"
      >
        <Link href={`/datasets/${datasetId}/skema`} data-testid="mapping-schema-link">
          <IconTableOptions aria-hidden />
          Buka halaman Skema
        </Link>
      </Button>
    </section>
  );
}
