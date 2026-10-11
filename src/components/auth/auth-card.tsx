import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Tautan di bawah kartu (mis. "Belum punya akun?"). */
  footer?: ReactNode;
}

/** Satu h1 per halaman auth; kartu lebar maks 28rem (dari layout). */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-1.5 p-6 pb-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent className="p-6 pt-4">{children}</CardContent>
      </Card>
      {footer ? <p className="text-center text-sm text-muted-foreground">{footer}</p> : null}
    </div>
  );
}
