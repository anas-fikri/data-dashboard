import "server-only";
import { IconTableOff } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { queryDeps } from "@/features/query/runtime";
import { sampleRows } from "@/features/schema/service";
import { logger } from "@/lib/logger";
import { RetryNotice } from "./retry-notice";
import { SampleTable } from "./sample-table";

/** Sampel 50 baris (di-stream lewat Suspense agar editor skema tidak menunggu DuckDB). */
export async function SampleSection({
  userId,
  datasetId,
  sheetId,
}: {
  userId: string;
  datasetId: string;
  sheetId: string;
}) {
  let r: Awaited<ReturnType<typeof sampleRows>>;
  try {
    r = await sampleRows(userId, datasetId, sheetId, await queryDeps());
  } catch (e) {
    logger.error(
      { userId, sheetId, err: e instanceof Error ? e.message : String(e) },
      "sampel gagal",
    );
    return <RetryNotice>Contoh data belum bisa dimuat. Coba lagi beberapa saat lagi.</RetryNotice>;
  }
  if (!r.ok) return <RetryNotice>{r.message}</RetryNotice>;
  if (r.rows.length === 0) {
    return (
      <EmptyState
        bare
        as="p"
        icon={<IconTableOff />}
        title="Tidak ada baris data"
        description="Sheet ini tidak berisi baris setelah baris judul. Bila judul terdeteksi di baris yang salah, ganti baris judul di atas."
      />
    );
  }
  return <SampleTable columns={r.columns} rows={r.rows} totalColumns={r.totalColumns} />;
}

export function SampleSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat contoh data">
      <div className="h-9 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
