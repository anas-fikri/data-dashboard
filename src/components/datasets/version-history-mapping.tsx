"use client";

import { IconLoader2, IconRoute, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MappingLastNotice } from "@/components/mapping/mapping-last";
import { useMappingPoll } from "@/components/mapping/use-mapping-job";
import { Button } from "@/components/ui/button";
import { discardVersionAction } from "@/features/versions/actions";
import type { MappingLast } from "@/features/versions/types";
import { ROW_CTA, VersionConfirm } from "./version-history-confirm";

interface VersionMappingNoticeProps {
  datasetId: string;
  /** null bila versi tidak terbaca dari riwayat (balapan): tombol buang disembunyikan. */
  versionId: string | null;
  fileName: string | null;
  /** Alasan tidak cocok dari ingest (A4), mis. kolom yang hilang. */
  message: string | null;
  /** Job pemetaan yang sedang antre/diterapkan, atau null. */
  mappingJobId: string | null;
  /** Hasil terakhir job pemetaan yang tidak selesai (gagal/perlu diperiksa), atau null. */
  last: MappingLast | null;
  /** Versi dibuang: panel unggah menampilkan hasil (yang menerima fokus). */
  onDiscarded: (fileName: string) => void;
}

/**
 * Versi refresh yang kolomnya tidak cocok dengan skema aktif (AWAITING_MAPPING, T-013/T-014): ajakan
 * utama "Petakan kolom", jalan keluar "Buang versi ini". Selama pemetaan diterapkan, status job
 * dipantau dan halaman dirender ulang setelah selesai (versi baru aktif, atau kembali bisa dipetakan).
 */
export function VersionMappingNotice({
  datasetId,
  versionId,
  fileName,
  message,
  mappingJobId,
  last,
  onDiscarded,
}: VersionMappingNoticeProps) {
  const router = useRouter();
  const job = useMappingPoll(datasetId, mappingJobId, () => router.refresh());
  const applying = job.phase !== null;
  const name = fileName ?? "file baru";
  return (
    <div
      className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="dataset-processing"
      data-state={applying ? "applying" : "mapping"}
    >
      {applying ? (
        <IconLoader2
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-primary motion-safe:animate-spin"
        />
      ) : (
        <IconRoute size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
      )}
      <div className="flex min-w-0 grow flex-col gap-2">
        {applying ? (
          <p role="status">
            <span className="block font-medium">Menerapkan pemetaan…</span>
            <span className="block text-muted-foreground [overflow-wrap:anywhere]">
              “{name}” aktif setelah selesai; sampai itu dashboard tetap memakai data aktif.
            </span>
          </p>
        ) : (
          <p>
            <span className="block font-medium [overflow-wrap:anywhere]">
              {fileName ? `“${fileName}” perlu pemetaan kolom` : "File baru perlu pemetaan kolom"}
            </span>
            <span className="block text-muted-foreground">
              Kolom file baru tidak cocok dengan skema aktif. Petakan kolomnya agar versi ini bisa
              dipakai; sampai itu dashboard tetap memakai data aktif. Bila filenya keliru, buang
              versi ini.
            </span>
          </p>
        )}
        {message && !applying ? (
          <p className="[overflow-wrap:anywhere]" data-testid="dataset-mapping-reason">
            <span className="font-medium">Alasan:</span> {message}
          </p>
        ) : null}
        {/* Hasil job pemetaan sebelumnya (gagal/perlu diperiksa) tidak hilang diam-diam. */}
        {last && !applying ? <MappingLastNotice last={last} /> : null}
        <div className="flex flex-col gap-2 md:flex-row">
          {applying ? null : (
            <Button asChild size="sm" className={ROW_CTA}>
              <Link href={`/datasets/${datasetId}/pemetaan`} data-testid="dataset-mapping-link">
                <IconRoute aria-hidden />
                Petakan kolom
              </Link>
            </Button>
          )}
          {versionId ? (
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
                onDiscarded(discarded.fileName);
                router.refresh();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
