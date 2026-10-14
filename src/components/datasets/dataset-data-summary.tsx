import { IconFileSpreadsheet, IconTableOptions } from "@tabler/icons-react";
import Link from "next/link";
import { FormAlert } from "@/components/auth/form-alert";
import { formatJakarta } from "@/components/datasets/version-history-status";
import { Button } from "@/components/ui/button";

/** Isi atas kartu "Data" di profil dataset: unggahan terakhir gagal, data aktif, tautan skema. */
export function DatasetDataSummary({
  datasetId,
  failed,
  active,
}: {
  datasetId: string;
  /** Versi terbaru gagal (badge "Gagal"); null bila tidak. */
  failed: { fileName: string | null; message: string | null } | null;
  active: { originalName: string | null; finishedAt: Date | string | null } | null;
}) {
  return (
    <>
      {failed ? (
        <FormAlert tone="error">
          <span className="block font-medium">
            {failed.fileName
              ? `Unggahan "${failed.fileName}" gagal diproses.`
              : "Unggahan terakhir gagal diproses."}
          </span>
          {failed.message ? (
            <span className="block" data-testid="dataset-status-message">
              {failed.message}
            </span>
          ) : null}
          <span className="block">
            {active
              ? "Dashboard tetap memakai data aktif sebelumnya. Perbaiki file lalu unggah ulang."
              : "Perbaiki file lalu unggah ulang."}
          </span>
        </FormAlert>
      ) : null}
      {active ? (
        <p className="flex items-start gap-3 text-sm" data-testid="dataset-active">
          <IconFileSpreadsheet
            size={20}
            stroke={1.5}
            aria-hidden
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0">
            <span className="block text-muted-foreground">Data aktif</span>
            <span className="block truncate font-medium">
              {active.originalName ?? "Tanpa nama file"}
            </span>
            {active.finishedAt ? (
              <span className="block text-muted-foreground">
                Diperbarui {formatJakarta(active.finishedAt)}
              </span>
            ) : null}
          </span>
        </p>
      ) : null}
      {active ? (
        <div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
          >
            <Link href={`/datasets/${datasetId}/skema`} data-testid="dataset-schema-link">
              <IconTableOptions aria-hidden />
              Tinjau &amp; koreksi skema
            </Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}
