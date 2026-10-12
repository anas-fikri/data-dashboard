"use client";

import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Select kustom (bukan <select> native) untuk filter/status: aksesibel via Radix,
 * caret tidak menempel ke tepi, tinggi dari token. Dipakai filter dashboard (T-012).
 */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-(--control-h) w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-base md:text-sm",
        "data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "[&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <IconChevronDown size={20} stroke={1.5} className="shrink-0 opacity-60" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = "popper", ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          // Tidak lebih lebar/tinggi dari ruang layar yang tersedia (review desain T-011 H6).
          "z-50 max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        // Teks panjang membungkus; target sentuh 44 px di ponsel.
        "relative flex min-h-11 w-full cursor-default select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm break-words whitespace-normal outline-none md:min-h-9",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck size={16} stroke={2} aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
