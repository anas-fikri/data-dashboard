import { IconDatabase, IconFileSpreadsheet, IconLayoutDashboard } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Beranda sementara: fokus satu aksi (buat dataset). Diisi data nyata di T-003. */
export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Beranda"
        description="Unggah Excel, rakit dashboard, bagikan ke tim. Tanpa rumus yang rusak."
        actions={
          <Button asChild>
            <Link href="/datasets/baru">
              <IconFileSpreadsheet aria-hidden />
              Buat dataset
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dataset saya</CardTitle>
            <CardDescription>Profil data dan file yang Anda unggah.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<IconDatabase />}
              title="Belum ada dataset"
              description="Mulai dengan mengunggah file .xlsx atau .csv sampai 1 GB."
              className="py-8"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dashboard dibagikan ke saya</CardTitle>
            <CardDescription>Dashboard dari rekan yang bisa Anda lihat.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<IconLayoutDashboard />}
              title="Belum ada dashboard"
              description="Dashboard yang dibagikan rekan akan muncul di sini."
              className="py-8"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
