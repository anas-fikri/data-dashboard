import Link from "next/link";
import { DatasetForm } from "@/components/datasets/dataset-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";

export const metadata = { title: "Buat dataset" };

export default async function NewDatasetPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/datasets" className="underline-offset-4 hover:underline">
            Dataset
          </Link>
        }
        title="Buat dataset"
        description="Beri nama yang mudah dikenali rekan. File Excel diunggah setelah dataset dibuat."
      />
      <Card>
        <CardContent className="pt-5">
          <DatasetForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
