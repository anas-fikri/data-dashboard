import { IconAlertCircle, IconCircleCheck } from "@tabler/icons-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface FormAlertProps {
  tone: "error" | "success";
  children: React.ReactNode;
}

/**
 * Pesan hasil form yang diumumkan ke pembaca layar; status tidak hanya lewat warna (ikon + teks).
 * Bisa difokuskan (tabIndex -1) agar kesalahan level form langsung terbaca.
 */
export const FormAlert = React.forwardRef<HTMLDivElement, FormAlertProps>(function FormAlert(
  { tone, children },
  ref,
) {
  const Icon = tone === "error" ? IconAlertCircle : IconCircleCheck;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === "error" ? "alert" : "status"}
      data-testid="form-alert"
      data-tone={tone}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
});
