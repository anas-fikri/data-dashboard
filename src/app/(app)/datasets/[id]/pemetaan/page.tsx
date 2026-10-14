import { IconArrowLeft, IconListCheck } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MappingForm } from "@/components/mapping/mapping-form";
import { baseKey } from "@/components/mapping/mapping-model";
import { MappingVersion } from "@/components/mapping/mapping-version";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { mappingView } from "@/features/versions/mapping";

type Params = Promise<{ id: string }>;

export const metadata = { title: "Pemetaan kolom" };

/**
 * Pemetaan kolom versi yang menunggu pemetaan (T-014). Bukan pemilik atau tidak ada → 404; tidak ada
 * versi yang menunggu (sudah dipetakan/dibuang, tab lain) → keadaan kosong dengan jalan kembali.
 */
export default async function MappingPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const view = await mappingView(user.id, id);
  if (!view) notFound();

  const back = (
    <Button
      asChild
      variant="outline"
      className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
    >
      <Link href={`/datasets/${view.datasetId}`}>
        <IconArrowLeft aria-hidden />
        Kembali ke dataset
      </Link>
    </Button>
  );
  const header = (
    <PageHeader
      eyebrow={
        <span className="flex min-w-0 flex-wrap gap-x-1">
          <Link
            href="/datasets"
            className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
          >
            Dataset
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={`/datasets/${view.datasetId}`}
            className="inline-flex min-h-6 min-w-0 items-center truncate underline-offset-4 hover:underline"
          >
            {view.datasetName}
          </Link>
        </span>
      }
      title="Pemetaan kolom"
      // Tanpa versi yang menunggu: deskripsi dan "Kembali" hanya dari keadaan kosong (tidak dobel).
      description={
        view.none
          ? undefined
          : "Kolom file baru tidak cocok dengan skema aktif. Petakan kolomnya; sampai disimpan, dashboard tetap memakai data aktif."
      }
      actions={view.none ? undefined : back}
    />
  );

  return (
    <div className="flex flex-col gap-6" data-testid="mapping-page">
      {header}
      {view.none ? (
        <EmptyState
          icon={<IconListCheck />}
          title="Tidak ada file yang perlu dipetakan"
          description="Versi yang menunggu pemetaan sudah dipetakan atau dibuang. Unggah file baru dari halaman dataset."
          action={back}
        />
      ) : (
        <>
          <MappingVersion view={view} />
          {/* Acuan skema aktif berubah (mis. muat ulang setelah STALE) → draf lama tidak berlaku. */}
          <MappingForm key={baseKey(view)} view={view} />
        </>
      )}
    </div>
  );
}
