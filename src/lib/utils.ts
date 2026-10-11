import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Gabungkan kelas Tailwind tanpa konflik (kelas terakhir menang). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Inisial untuk avatar: "Anas Fikri" → "AF", "anas@x.id" → "A". */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0]! : nameOrEmail;
  const parts = base
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}
