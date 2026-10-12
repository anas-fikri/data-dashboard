import { IconLayoutDashboard, IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Dashboard tanpa widget: langkah berikutnya sesuai mode. Mode edit tidak punya tombol sendiri —
 * "Tambah widget" di toolbar tetap satu-satunya aksi utama.
 */
export function CanvasEmpty({ dashboardId, editing }: { dashboardId: string; editing: boolean }) {
  const cta = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
  return (
    <EmptyState
      icon={<IconLayoutDashboard />}
      title="Dashboard masih kosong"
      description={
        editing
          ? "Pilih Tambah widget di atas untuk memulai, lalu atur posisi dan ukurannya."
          : "Ubah tata letak untuk menambahkan widget."
      }
      action={
        editing ? undefined : (
          <Button asChild className={cta}>
            <Link href={`/dashboards/${dashboardId}?mode=edit`}>
              <IconPencil aria-hidden />
              Ubah tata letak
            </Link>
          </Button>
        )
      }
    />
  );
}
