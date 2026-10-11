"use client";

import { DropdownMenu as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Menu aksi/akun berbasis Radix: keyboard, fokus, dan penutupan ditangani primitif. */
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <Primitive.Item
      ref={ref}
      className={cn(
        "flex h-9 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
        destructive && "text-destructive data-[highlighted]:bg-destructive/10",
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof Primitive.Label>,
  React.ComponentPropsWithoutRef<typeof Primitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <Primitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof Primitive.Separator>,
  React.ComponentPropsWithoutRef<typeof Primitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <Primitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
});
