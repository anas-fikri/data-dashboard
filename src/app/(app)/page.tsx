import { IconDatabase, IconFileSpreadsheet, IconLayoutDashboard } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";

/** Beranda sementara: satu aksi utama (buat dataset). Diisi data nyata di T-003. */
export default async function HomePage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Beranda"
        description="Dataset dan dashboard yang bisa Anda akses."
        actions={
          <Button asChild>
            <Link href="/datasets">
              <IconFileSpreadsheet aria-hidden />
              Buat dataset
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dataset saya</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              bare
              as="p"
              icon={<IconDatabase />}
              title="Belum ada dataset"
              description="Unggah file .xlsx atau .csv sampai 1 GB untuk mulai."
              className="py-8"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dashboard dibagikan ke saya</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              bare
              as="p"
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
