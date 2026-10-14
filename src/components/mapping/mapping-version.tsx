import { IconFileOff } from "@tabler/icons-react";
import { formatJakarta } from "@/components/datasets/version-history-status";
import { MappingDiscard } from "./mapping-discard";
import type { MappingReady } from "./mapping-types";

/**
 * Konteks versi: file baru yang menunggu vs data aktif yang tetap dipakai, plus jalan keluar
 * "Buang versi ini". Aksi sekunder (outline); CTA utama halaman ada di bar simpan.
 */
export function MappingVersion({ view }: { view: MappingReady }) {
  const { awaiting, active } = view;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 md:flex-row md:items-start md:justify-between md:gap-6">
      <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">File baru · menunggu pemetaan</dt>
          <dd className="font-medium [overflow-wrap:anywhere]">
            {awaiting.fileName ?? "Tanpa nama file"}
          </dd>
          <dd className="text-xs text-muted-foreground">
            Diunggah <time dateTime={awaiting.createdAt}>{formatJakarta(awaiting.createdAt)}</time>
          </dd>
          {awaiting.sourceDeleted ? (
            <dd className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <IconFileOff size={16} stroke={1.5} aria-hidden className="shrink-0" />
              File asli sudah dihapus; pemetaan memakai data yang sudah diproses.
            </dd>
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Data aktif sekarang</dt>
          <dd className="font-medium [overflow-wrap:anywhere]">
            {active.fileName ?? "Tanpa nama file"}
          </dd>
          <dd className="text-xs text-muted-foreground">
            Tetap dipakai dashboard sampai pemetaan disimpan.
          </dd>
        </div>
      </dl>
      <div className="shrink-0">
        <MappingDiscard
          datasetId={view.datasetId}
          versionId={awaiting.id}
          fileName={awaiting.fileName}
        />
      </div>
    </div>
  );
}
