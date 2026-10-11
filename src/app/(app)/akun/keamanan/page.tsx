import { SecuritySettings } from "@/components/auth/security-settings";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";

export const metadata = { title: "Keamanan akun" };

export default async function SecurityPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Keamanan akun" description={user.email} />
      <SecuritySettings />
    </div>
  );
}
