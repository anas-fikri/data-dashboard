import type { GuideContextValue, GuideRoleValue } from "@/features/guides/validation";

/** Nama peran sasaran artikel panduan (T-020). */
export const ROLE_LABEL: Record<GuideRoleValue, string> = {
  OWNER: "Pemilik data",
  EDITOR: "Editor",
  VIEWER: "Viewer",
  ADMIN: "Admin",
  ALL: "Semua peran",
};

/** Halaman bantuan kontekstual (T-022). */
export const CONTEXT_LABEL: Record<GuideContextValue, string> = {
  UPLOAD: "Unggah data",
  SCHEMA: "Skema dataset",
  BUILDER: "Penyusun dashboard",
};
