"use client";

import { IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { VersionConfirm } from "@/components/datasets/version-history-confirm";
import { discardVersionAction } from "@/features/versions/actions";

/**
 * "Buang versi ini" tetap terjangkau dari halaman pemetaan (versi yang menunggu menahan unggahan
 * baru). Berhasil → kembali ke dataset dengan pemberitahuan hasil.
 */
export function MappingDiscard({
  datasetId,
  versionId,
  fileName,
}: {
  datasetId: string;
  versionId: string;
  fileName: string | null;
}) {
  const router = useRouter();
  return (
    <VersionConfirm
      label="Buang versi ini"
      icon={<IconTrash aria-hidden />}
      testId="mapping-discard"
      title={`Buang versi “${fileName ?? "file baru"}”?`}
      description="File ini tidak dipakai; data aktif sekarang tetap dipakai dashboard. Anda bisa mengunggah file yang sudah diperbaiki."
      confirmLabel="Buang versi"
      destructive
      run={() => discardVersionAction(datasetId, versionId)}
      onDone={() => router.push(`/datasets/${datasetId}?discarded=1`)}
    />
  );
}
