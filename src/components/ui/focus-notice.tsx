"use client";

import { useEffect, useRef } from "react";
import { FormAlert } from "@/components/auth/form-alert";

/** Pemberitahuan hasil aksi (mis. setelah redirect) yang langsung menerima fokus saat tampil. */
export function FocusNotice({
  tone = "success",
  children,
}: {
  tone?: "success" | "error";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <FormAlert tone={tone} ref={ref}>
      {children}
    </FormAlert>
  );
}
