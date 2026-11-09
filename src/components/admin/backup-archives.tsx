import { IconCircleCheck, IconClockHour4, IconServer } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { archiveTime } from "@/features/backup/display";
import type { BackupStatus } from "@/features/backup/types";
import { formatSize, formatWib } from "./backup-format";

/** Arsip backup di server (dari status.json service backup), terbaru dulu, dengan tanda salinan NAS (T-tsvf). */
export function BackupArchives({ status }: { status: BackupStatus | null }) {
  const archives = status?.archives ?? [];
  const toNas = !!status?.target;
  return (
    <section aria-labelledby="backup-archives-heading" className="flex flex-col gap-3">
      <h2 id="backup-archives-heading" className="text-base font-semibold">
        Arsip di server
      </h2>
      {archives.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status
            ? "Belum ada arsip di server, atau daftar belum tersedia (muncul setelah backup harian atau kirim ulang berikutnya)."
            : "Belum ada catatan backup."}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {archives.length} arsip
            {status?.localBytes !== null && status?.localBytes !== undefined
              ? ` · ${formatSize(status.localBytes)}`
              : ""}
            {toNas
              ? ". Arsip yang sudah di NAS dihapus dari server setelah lama simpan server; yang belum tidak dihapus sampai berhasil dikirim (atau lewat lama simpan NAS)."
              : ". Salinan ke NAS belum aktif: arsip hanya ada di server ini."}
          </p>
          {/* Wilayah gulir harus bisa difokus agar bisa digulir dengan papan ketik (axe scrollable-region-focusable). */}
          <div
            className="max-h-96 overflow-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            role="region"
            aria-labelledby="backup-archives-heading"
            data-testid="backup-archives"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Arsip backup di server, terbaru dulu</caption>
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Waktu backup
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Ukuran
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Salinan NAS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {archives.map((a) => (
                  <tr key={a.name}>
                    <td className="px-3 py-2 sm:whitespace-nowrap">
                      {formatWib(archiveTime(a.name)) ?? a.name}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {formatSize(a.sizeBytes)}
                    </td>
                    <td className="px-3 py-2">
                      {!toNas ? (
                        <Badge icon={<IconServer />}>Hanya di server</Badge>
                      ) : a.offsite ? (
                        <Badge tone="success" icon={<IconCircleCheck />}>
                          Sudah di NAS
                        </Badge>
                      ) : (
                        <Badge tone="warning" icon={<IconClockHour4 />}>
                          Menunggu dikirim
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
