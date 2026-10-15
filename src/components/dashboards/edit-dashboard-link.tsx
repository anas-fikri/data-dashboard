"use client";

import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/** URL mode edit yang membawa filter aktif (?f=); dipakai juga tautan peringatan dialog share. Murni. */
export const editModeHref = (id: string, f: string | null) =>
  `/dashboards/${id}?mode=edit${f ? `&f=${encodeURIComponent(f)}` : ""}`;

/**
 * "Ubah tata letak" (mode lihat → edit) yang membawa filter aktif (?f=, T-012). Filter ditulis ke URL
 * dengan history.replaceState; Next menyinkronkannya ke useSearchParams, jadi tautan selalu terkini.
 */
export function EditDashboardLink({ id }: { id: string }) {
  const href = editModeHref(id, useSearchParams().get("f"));
  return (
    <Button asChild className="h-(--control-h-lg) md:h-(--control-h)">
      <Link href={href} data-testid="edit-dashboard">
        <IconPencil aria-hidden />
        Ubah tata letak
      </Link>
    </Button>
  );
}
