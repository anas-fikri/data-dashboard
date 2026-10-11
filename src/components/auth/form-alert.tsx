import { IconAlertCircle, IconCircleCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface FormAlertProps {
  tone: "error" | "success";
  children: React.ReactNode;
}

/** Pesan hasil form yang diumumkan ke pembaca layar; status tidak hanya lewat warna (ikon + teks). */
export function FormAlert({ tone, children }: FormAlertProps) {
  const Icon = tone === "error" ? IconAlertCircle : IconCircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-testid="form-alert"
      data-tone={tone}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-foreground"
          : "border-success/40 bg-success/10 text-foreground",
      )}
    >
      <Icon
        size={20}
        stroke={1.5}
        aria-hidden
        className={cn("mt-px shrink-0", tone === "error" ? "text-destructive" : "text-success")}
      />
      <div>{children}</div>
    </div>
  );
}
