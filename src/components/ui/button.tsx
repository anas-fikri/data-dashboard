import { IconLoader2 } from "@tabler/icons-react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Geometri kontrol: tinggi dari token, slot ikon tetap (tidak menyusut), label tetap
 * saat pending (spinner menggantikan ikon awal, bukan menggeser teks).
 * Di <768 varian "primary" di form/toolbar dibuat full-width oleh pemanggil (className="w-full sm:w-auto").
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-(--control-h-sm) px-3",
        md: "h-(--control-h) px-4",
        lg: "h-(--control-h-lg) px-5 text-base",
        icon: "size-(--control-h)",
        "icon-sm": "size-(--control-h-sm)",
        "icon-lg": "size-(--control-h-lg)",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render sebagai elemen anak (mis. <Link>) sambil mempertahankan gaya. */
  asChild?: boolean;
  /** Menampilkan spinner dan menonaktifkan tombol tanpa mengubah lebar. */
  pending?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    pending = false,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  const isIconOnly = size?.startsWith("icon");
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {pending ? <IconLoader2 className="animate-spin" aria-hidden /> : leadingIcon}
          {isIconOnly && pending ? null : children}
          {!pending && trailingIcon}
        </>
      )}
    </Comp>
  );
});

export { buttonVariants };
