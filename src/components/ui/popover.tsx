"use client";

import { Popover as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Popover non-modal (Radix): halaman di belakangnya tidak di-aria-hidden (Select modal melakukannya →
 * axe aria-hidden-focus, T-019). Fokus pindah ke isi saat dibuka, Escape/klik di luar menutup dan
 * fokus kembali ke pemicu. Tinggi dibatasi ruang layar yang tersedia; isi panjang bergulir.
 */
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(function PopoverContent({ className, sideOffset = 6, align = "start", ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={16}
        className={cn(
          "z-50 flex max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
});
