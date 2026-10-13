import {
  IconBan,
  IconCircleCheck,
  IconMailQuestion,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";

export function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <Badge tone="primary" icon={<IconShieldCheck />}>
      Admin
    </Badge>
  ) : (
    <Badge icon={<IconUser />}>Pengguna</Badge>
  );
}

/** Nonaktif mengalahkan status verifikasi: akun nonaktif tidak bisa masuk apa pun statusnya. */
export function AccountStatusBadge({
  isActive,
  emailVerified,
}: {
  isActive: boolean;
  emailVerified: boolean;
}) {
  if (!isActive) {
    return (
      <Badge tone="destructive" icon={<IconBan />}>
        Nonaktif
      </Badge>
    );
  }
  if (!emailVerified) {
    return (
      <Badge tone="warning" icon={<IconMailQuestion />}>
        Belum verifikasi
      </Badge>
    );
  }
  return (
    <Badge tone="success" icon={<IconCircleCheck />}>
      Aktif
    </Badge>
  );
}
