"use client";

import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * "Ubah tata letak" (mode lihat → edit) yang membawa filter aktif (?f=, T-012). Filter ditulis ke URL
 * dengan history.replaceState; Next menyinkronkannya ke useSearchParams, jadi tautan selalu terkini.
 */
export function EditDashboardLink({ id }: { id: string }) {
  const f = useSearchParams().get("f");
  const href = `/dashboards/${id}?mode=edit${f ? `&f=${encodeURIComponent(f)}` : ""}`;
  return (
    <Button asChild className="h-(--control-h-lg) md:h-(--control-h)">
      <Link href={href} data-testid="edit-dashboard">
        <IconPencil aria-hidden />
        Ubah tata letak
      </Link>
    </Button>
  );
}
