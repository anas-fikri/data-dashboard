import { cn, initials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  size?: "sm" | "md";
  className?: string;
}

/** Avatar inisial (tanpa foto di v1). Warna dari token, bukan hex. */
export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
        size === "sm" ? "size-7 text-xs" : "size-8 text-sm",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
