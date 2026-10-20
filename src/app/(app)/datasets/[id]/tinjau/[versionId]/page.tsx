import { IconArrowLeft, IconChecklist } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PeriodReviewForm } from "@/components/datasets/period-review-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { periodReviewPage } from "@/features/versions/period-review";

type Params = Promise<{ id: string; versionId: string }>;

export const metadata = { title: "Tinjau perubahan periode" };

/**
 * Tinjauan unggahan periode yang menunggu konfirmasi (T-054): pemilik saja (lainnya 404, D2). Versi
 * yang tidak lagi menunggu (diterapkan, dibatalkan, diproses ulang, kedaluwarsa) → keadaan kosong.
 */
export default async function PeriodReviewPage({ params }: { params: Params }) {
  const { id, versionId } = await params;
  const user = await requireUser();
  const page = await periodReviewPage(user.id, id, versionId);
  if (!page) notFound();
  const datasetId = page.state === "pending" ? page.context.datasetId : page.datasetId;
  const datasetName = page.state === "pending" ? page.context.datasetName : page.datasetName;

  const back = (
    <Button
      asChild
      variant="outline"
      className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
    >
      <Link href={`/datasets/${datasetId}`}>
        <IconArrowLeft aria-hidden />
        Kembali ke dataset
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6" data-testid="review-page" data-state={page.state}>
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
              href={`/datasets/${datasetId}`}
              className="inline-flex min-h-6 min-w-0 items-center truncate underline-offset-4 hover:underline"
            >
              {datasetName}
            </Link>
          </span>
        }
        title="Tinjau perubahan periode"
        description={
          page.state === "pending"
            ? `File “${page.context.fileName ?? "tanpa nama"}” menunggu keputusan Anda. Periksa periode yang ditambah, diganti, atau dilepas sebelum menerapkan.`
            : undefined
        }
        actions={back}
      />
      {page.state === "gone" ? (
        <EmptyState
          icon={<IconChecklist />}
          title="Unggahan ini tidak lagi menunggu konfirmasi"
          description="Mungkin sudah diterapkan, dibatalkan, sedang diproses ulang, atau dibuang otomatis setelah 7 hari tanpa keputusan. Lihat status terbarunya di halaman dataset."
          action={back}
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <PeriodReviewForm
              context={page.context}
              initial={page.review.ok ? page.review.data : null}
              initialError={page.review.ok ? null : page.review.message}
              initialCode={page.review.ok ? null : page.review.code}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
