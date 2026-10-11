import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  id: string;
  label: string;
  /** Teks bantuan singkat di bawah kontrol. */
  hint?: string;
  /** Pesan kesalahan yang bisa ditindak; diumumkan ke pembaca layar. */
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; invalid?: boolean }>;
}

/** Label + kontrol + hint/error dengan pengaitan aria yang benar. */
export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </label>
      {React.cloneElement(children, { id, "aria-describedby": describedBy, invalid: !!error })}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
