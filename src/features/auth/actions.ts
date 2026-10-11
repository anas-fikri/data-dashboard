"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { fieldOf, withRetryHint, type FormState } from "./form-state";
import * as recovery from "./password-recovery";
import { clientIp } from "./rate-limit";
import { safeNext } from "./redirect";
import * as service from "./service";
import { createSession, destroySession, getSessionUser, knownDeviceUserId } from "./session";

async function ip(): Promise<string> {
  return clientIp(await headers(), env().TRUST_PROXY);
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

function toError(
  result: { code: service.AuthCode; message: string; retryAfterSec?: number },
  formData: FormData,
): FormState {
  return {
    status: "error",
    code: result.code,
    message: withRetryHint(result.code, result.message, result.retryAfterSec),
    retryAfterSec: result.retryAfterSec,
    field: fieldOf(result.code),
    values: { email: str(formData.get("email")), name: str(formData.get("name")) },
  };
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await service.register({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    ip: await ip(),
  });
  if (!result.ok) return toError(result, formData);
  return { status: "success", email: result.data.email };
}

export async function resendVerificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const emailRaw = formData.get("email");
  const result = await service.resendVerification(emailRaw, await ip());
  if (!result.ok) return toError(result, formData);
  return { status: "success", email: str(emailRaw) };
}

/** Konfirmasi aktivasi (POST + password pendaftaran): pemindai tautan GET tidak bisa memakai token. */
export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await service.verifyEmail(
    formData.get("token"),
    formData.get("password"),
    await ip(),
  );
  if (!result.ok) return toError(result, formData);
  await destroySession();
  redirect("/login?verified=1");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await service.login({
    email: formData.get("email"),
    password: formData.get("password"),
    ip: await ip(),
    knownDeviceUserId: await knownDeviceUserId(),
  });
  if (!result.ok) return toError(result, formData);
  await createSession(result.data);
  redirect(safeNext(formData.get("next")));
}

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const emailRaw = formData.get("email");
  const result = await recovery.requestPasswordReset(emailRaw, await ip());
  if (!result.ok) return toError(result, formData);
  return { status: "success", email: str(emailRaw) };
}

/** Atur ulang password lewat token (POST). Sukses → login dengan password baru. */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await recovery.resetPassword(
    formData.get("token"),
    formData.get("password"),
    await ip(),
  );
  if (!result.ok) return toError(result, formData);
  await destroySession();
  redirect("/login?reason=password-reset");
}

/**
 * Ganti password saat login: semua sesi lain terputus (sessionVersion++), perangkat ini
 * langsung mendapat sesi baru sehingga pengguna tidak perlu masuk ulang.
 */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fakun%2Fkeamanan");
  const result = await recovery.changePassword(
    user.id,
    formData.get("current"),
    formData.get("password"),
  );
  if (!result.ok) {
    const state = toError(result, formData);
    if (state.status === "error" && result.code === "INVALID_CREDENTIALS") state.field = "current";
    return state;
  }
  await createSession(result.data);
  return { status: "success", email: user.email };
}

/** Keluar: cabut semua sesi user di server (sessionVersion++), lalu hapus cookie. */
export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) await service.revokeSessions(user.id);
  await destroySession();
  redirect("/login?reason=signed-out");
}
