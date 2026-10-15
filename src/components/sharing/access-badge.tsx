import { IconBuilding, IconEye, IconLock, IconPencil, IconUsers } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import type { DashboardAccessRole } from "@/features/sharing/types";
import { accessLabels, sharedRoleLabel, type AccessKind } from "./share-model";

/*
 * Badge berbagi (T-016). Teks selalu menyebut statusnya; ikon dekoratif (pola Badge). Peran pemilik
 * tidak diberi badge — hanya non-pemilik yang perlu tahu batas aksesnya.
 */
const ACCESS_ICON: Record<AccessKind, React.ReactNode> = {
  private: <IconLock />,
  people: <IconUsers />,
  org: <IconBuilding />,
};

/** Akses dashboard milik sendiri (daftar /dashboards): Pribadi / N orang / Organisasi. */
export function AccessBadges({
  orgShared,
  shareCount,
}: {
  orgShared: boolean;
  shareCount: number;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="dashboard-access">
      {accessLabels({ orgShared, shareCount }).map((a) => (
        <Badge
          key={a.kind}
          tone={a.kind === "private" ? "neutral" : "primary"}
          icon={ACCESS_ICON[a.kind]}
        >
          {a.text}
        </Badge>
      ))}
    </span>
  );
}

/** Peran non-pemilik: "Hanya lihat" (viewer) atau "Editor". */
export function SharedRoleBadge({ role }: { role: Exclude<DashboardAccessRole, "OWNER"> }) {
  return (
    <Badge
      tone={role === "EDITOR" ? "primary" : "neutral"}
      icon={role === "EDITOR" ? <IconPencil /> : <IconEye />}
    >
      {sharedRoleLabel(role)}
    </Badge>
  );
}
