import type { SmtpSecurity } from "@/lib/smtp-settings";

/** Pengaturan SMTP untuk form Admin › Email (T-byys): password tidak pernah dikirim balik ke browser. */
export interface SmtpView {
  /** "app" = Admin › Email (app/smtp.json); "env" = bawaan server (SMTP_URL di .env). */
  source: "app" | "env";
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  hasPassword: boolean;
  fromAddress: string;
  fromName: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Isian form (password kosong = pakai password yang berlaku). */
export interface SmtpInput {
  host: string;
  port: string;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

export type SmtpField = keyof SmtpInput | "testTo";

export type SmtpResult<T = null> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "BUSY";
      message: string;
      field?: SmtpField;
    };
