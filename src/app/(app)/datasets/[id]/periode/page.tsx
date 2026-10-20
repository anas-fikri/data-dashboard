import { IconArrowLeft, IconCalendarStats } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PeriodSettingsForm, PeriodSetupForm } from "@/components/datasets/period-setup-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { periodSetupView } from "@/features/versions/period-setup";

type Params = Promise<{ id: string }>;

export const metadata = { title: "Atur periode" };

/**
 * "Atur periode" (T-051): pemilik saja (lainnya 404, D2). Data biasa → pilihan sumber + Tinjau +
 * Terapkan; sudah per periode → pengaturan saja; tanpa data / ada proses lain → keadaan kosong.
 */
export default async function PeriodSetupPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const view = await periodSetupView(user.id, id);
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

  return (
    <div className="flex flex-col gap-6" data-testid="period-page" data-state={view.state}>
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
        title="Atur periode"
        description="Simpan data per bulan, kuartal, atau tahun: setiap periode bisa ditambah atau diganti tanpa mengunggah ulang semua data."
        actions={back}
      />
      {view.state === "empty" || view.state === "busy" ? (
        <EmptyState
          icon={<IconCalendarStats />}
          title={view.state === "empty" ? "Belum ada data untuk diatur" : "Dataset sedang diproses"}
          description={
            view.state === "empty"
              ? "Unggah data dulu dari halaman dataset, lalu atur periodenya."
              : "Tunggu file yang sedang diproses, atau selesaikan versi yang menunggu pemetaan/konfirmasi, lalu buka halaman ini lagi."
          }
          action={back}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {view.state === "period" ? "Pengaturan periode" : "Sumber periode"}
            </CardTitle>
            <CardDescription>
              {view.state === "period"
                ? "Dataset ini sudah menyimpan data per periode."
                : "Pilih satuan dan dari mana periode setiap baris diambil, lalu tinjau sebarannya sebelum menerapkan."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.state === "period" ? (
              <PeriodSettingsForm view={view} />
            ) : (
              <PeriodSetupForm view={view} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
