"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { AuthField, FormState } from "@/features/auth/form-state";

/**
 * Setiap state error baru: fokus ke field yang salah, atau ke alert form bila kesalahan
 * bukan milik satu field (review desain T-002 #2). Tidak memanggil setState.
 */
export function useFocusOnError(
  state: FormState,
  refs: Partial<Record<AuthField, RefObject<HTMLInputElement | null>>>,
) {
  const alertRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field ? refs[state.field]?.current : null;
    if (target) target.focus();
    else alertRef.current?.focus();
    // refs stabil (useRef); hanya bereaksi pada state baru
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return alertRef;
}
