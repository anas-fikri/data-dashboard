/* eslint-disable jsx-a11y/no-redundant-roles -- peran eksplisit (table/rowgroup/row) menjaga
   semantik tabel saat display diubah ke block/flex untuk tampilan kartu; Safari/VoiceOver membuang
   semantik tabel tanpa ini. */
import { IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { VersionRow } from "@/features/versions/types";
import { cn } from "@/lib/utils";
import { VersionFeedback } from "./version-history-actions";
import { VersionHistoryRow } from "./version-history-row";

const TH = "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

/**
 * Kartu "Riwayat versi" di profil dataset (T-013): versi terbaru dulu, versi aktif bertanda jelas,
 * pemilik bisa mengaktifkan versi siap lain. Tabel bergantung LEBAR KONTAINER (≥ @3xl), di bawahnya
 * tiap versi menjadi kartu. Pemanggil tidak merender kartu ini bila belum ada versi. Selama dataset
 * sibuk (ada versi yang diunggah/diproses/menunggu pemetaan) tombol "Aktifkan" tidak ditawarkan.
 */
export function VersionHistory({
  datasetId,
  versions,
  busy,
}: {
  datasetId: string;
  versions: VersionRow[];
  busy: boolean;
}) {
  return (
    <Card data-testid="version-history">
      <CardHeader>
        <CardTitle>Riwayat versi</CardTitle>
        <CardDescription>
          Setiap file yang diunggah menjadi satu versi. Aktifkan versi lain bila data terbaru
          keliru.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {busy ? (
          <p
            className="flex items-start gap-1.5 text-sm text-muted-foreground"
            data-testid="version-busy"
          >
            <IconInfoCircle size={20} stroke={1.5} aria-hidden className="shrink-0" />
            Versi aktif bisa diganti setelah file baru selesai diunggah dan diproses, atau setelah
            versi yang menunggu pemetaan dibuang.
          </p>
        ) : null}
        <VersionFeedback activeVersionId={versions.find((v) => v.active)?.id ?? null}>
          {/* Selebar kartu (tanpa kotak di dalam kotak); sel tepi sejajar dengan isi kartu. */}
          <div className="@container -mx-5 border-y">
            <table role="table" className="block w-full text-sm @3xl:table @3xl:border-collapse">
              <caption className="sr-only">Riwayat versi data, terbaru di atas</caption>
              <thead
                role="rowgroup"
                className="sr-only @3xl:not-sr-only @3xl:table-header-group @3xl:border-b @3xl:bg-muted/50"
              >
                <tr role="row">
                  <th role="columnheader" scope="col" className={cn(TH, "pl-5")}>
                    File
                  </th>
                  <th role="columnheader" scope="col" className={TH}>
                    Status
                  </th>
                  <th role="columnheader" scope="col" className={TH}>
                    Diproses
                  </th>
                  <th role="columnheader" scope="col" className={cn(TH, "text-right")}>
                    Ukuran
                  </th>
                  <th role="columnheader" scope="col" className={cn(TH, "pr-5")}>
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup" className="block @3xl:table-row-group">
                {versions.map((v) => (
                  <VersionHistoryRow key={v.id} datasetId={datasetId} v={v} busy={busy} />
                ))}
              </tbody>
            </table>
          </div>
        </VersionFeedback>
        <p className="text-xs text-muted-foreground">
          Sistem menyimpan 3 versi siap terakhir; versi lebih lama dihapus otomatis. File asli
          dihapus 7 hari setelah diproses.
        </p>
      </CardContent>
    </Card>
  );
}
