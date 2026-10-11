"use client";

import { IconEye, IconEyeOff } from "@tabler/icons-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./input";

/** Input password dengan tombol tampilkan/sembunyikan (aria-pressed), tanpa mengubah tinggi. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label="Tampilkan password"
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
        >
          {visible ? (
            <IconEyeOff size={20} stroke={1.5} aria-hidden />
          ) : (
            <IconEye size={20} stroke={1.5} aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
