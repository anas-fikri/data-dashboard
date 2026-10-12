import { IconLayoutDashboard, IconPencil, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Dashboard tanpa widget: langkah berikutnya sesuai mode (tambah widget / masuk mode edit). */
export function CanvasEmpty({
  dashboardId,
  editing,
  adding,
  onAdd,
}: {
  dashboardId: string;
  editing: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const cta = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
  return (
    <EmptyState
      icon={<IconLayoutDashboard />}
      title="Dashboard masih kosong"
      description={
        editing
          ? "Tambahkan widget pertama, lalu atur posisi dan ukurannya."
          : "Ubah tata letak untuk menambahkan widget."
      }
      action={
        editing ? (
          <Button
            className={cta}
            pending={adding}
            leadingIcon={<IconPlus aria-hidden />}
            onClick={onAdd}
          >
            Tambah widget
          </Button>
        ) : (
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
