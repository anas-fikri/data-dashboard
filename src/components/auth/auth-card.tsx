import type { ReactNode, Ref } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Tautan di bawah kartu (mis. "Belum punya akun?"). */
  footer?: ReactNode;
  /** Untuk memfokuskan judul saat isi kartu berganti (mis. sukses daftar). */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Satu h1 per halaman auth (24px sesuai tangga tipografi); kartu lebar maks 28rem. */
export function AuthCard({ title, description, children, footer, headingRef }: AuthCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-1.5 p-6 pb-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            {title}
          </h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent className="p-6 pt-4">{children}</CardContent>
      </Card>
      {footer ? <p className="text-center text-sm text-muted-foreground">{footer}</p> : null}
    </div>
  );
}
