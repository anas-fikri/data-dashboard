"use client";

import { IconRoute, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { discardVersionAction } from "@/features/versions/actions";
import { VersionConfirm } from "./version-history-confirm";

interface VersionMappingNoticeProps {
  datasetId: string;
  /** null bila versi tidak terbaca dari riwayat (balapan): tombol buang disembunyikan. */
  versionId: string | null;
  fileName: string | null;
  /** Alasan tidak cocok dari ingest (A4), mis. kolom yang hilang. */
  message: string | null;
  /** Versi dibuang: panel unggah menampilkan hasil (yang menerima fokus). */
  onDiscarded: (fileName: string) => void;
}

/**
 * Versi refresh yang kolomnya tidak cocok dengan skema aktif (AWAITING_MAPPING). Pemetaan kolom
 * datang di T-014; sampai itu pemilik bisa membuang versi ini lalu mengunggah file yang diperbaiki.
 */
export function VersionMappingNotice({
  datasetId,
  versionId,
  fileName,
  message,
  onDiscarded,
}: VersionMappingNoticeProps) {
  const router = useRouter();
  const name = fileName ?? "file baru";
  return (
    <div
      className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="dataset-processing"
    >
      <IconRoute size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 grow flex-col gap-2">
        <p>
          <span className="block font-medium [overflow-wrap:anywhere]">
            {fileName ? `“${fileName}” perlu pemetaan kolom` : "File baru perlu pemetaan kolom"}
          </span>
          <span className="block text-muted-foreground">
            Kolom file baru tidak cocok dengan skema aktif. Pemetaan kolom akan tersedia; untuk
            sekarang buang versi ini lalu unggah file dengan kolom yang sama.
          </span>
        </p>
        {message ? (
          <p className="[overflow-wrap:anywhere]" data-testid="dataset-mapping-reason">
            <span className="font-medium">Alasan:</span> {message}
          </p>
        ) : null}
        {versionId ? (
          <div>
            <VersionConfirm
              label="Buang versi ini"
              icon={<IconTrash aria-hidden />}
              testId="version-discard"
              title={`Buang versi “${name}”?`}
              description="File ini tidak dipakai; data aktif sekarang tetap dipakai dashboard. Anda bisa mengunggah file yang sudah diperbaiki."
              confirmLabel="Buang versi"
              destructive
              run={() => discardVersionAction(datasetId, versionId)}
              onDone={(discarded) => {
                onDiscarded(discarded);
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
