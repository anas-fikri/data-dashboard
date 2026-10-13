"use client";

import { Switch as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Sakelar (role="switch", aria-checked) dari Radix. Lintasan 20×36 px di dalam kotak sentuh 44 px di
 * ponsel/sentuh (24 px di mouse ≥ md); keadaan tidak hanya lewat warna — bulatan berpindah sisi dan
 * mode warna paksa memakai garis sistem. Label wajib dari pemanggil (htmlFor / aria-labelledby).
 */
export const Switch = React.forwardRef<
  React.ComponentRef<typeof Primitive.Root>,
  React.ComponentPropsWithoutRef<typeof Primitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <Primitive.Root
      ref={ref}
      className={cn(
        "group relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none md:not-any-pointer-coarse:h-6",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none flex h-5 w-9 items-center rounded-full border border-input bg-muted p-0.5 transition-colors",
          "group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary",
          "forced-colors:border-[CanvasText] forced-colors:group-data-[state=checked]:bg-[Highlight]",
        )}
      >
        <Primitive.Thumb
          className={cn(
            "block size-3.5 rounded-full bg-foreground/70 shadow-xs transition-transform motion-reduce:transition-none",
            "data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground",
            "forced-colors:bg-[CanvasText]",
          )}
        />
      </span>
    </Primitive.Root>
  );
});
