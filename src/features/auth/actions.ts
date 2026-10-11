"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { clientIp } from "./rate-limit";
import { safeNext } from "./redirect";
import * as service from "./service";
import { createSession, destroySession, getSessionUser, knownDeviceUserId } from "./session";

/** Bentuk state untuk useActionState di form auth (keputusan D2: code, bukan HTTP status). */
export type FormState =
  | { status: "idle" }
  | { status: "error"; code: service.AuthCode; message: string; retryAfterSec?: number }
  | { status: "success"; email: string };

async function ip(): Promise<string> {
  return clientIp(await headers(), env().TRUST_PROXY);
}

function toError(result: {
  code: service.AuthCode;
  message: string;
  retryAfterSec?: number;
}): FormState {
  return {
    status: "error",
    code: result.code,
    message: result.message,
    retryAfterSec: result.retryAfterSec,
  };
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await service.register({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    ip: await ip(),
  });
  if (!result.ok) return toError(result);
  return { status: "success", email: result.data.email };
}

export async function resendVerificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const emailRaw = formData.get("email");
  const result = await service.resendVerification(emailRaw, await ip());
  if (!result.ok) return toError(result);
  return { status: "success", email: typeof emailRaw === "string" ? emailRaw : "" };
}

/** Konfirmasi aktivasi (POST): pemindai tautan email yang hanya melakukan GET tidak bisa memakai token. */
export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await service.verifyEmail(formData.get("token"), await ip());
  if (!result.ok) return toError(result);
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
  if (!result.ok) return toError(result);
  await createSession(result.data);
  redirect(safeNext(formData.get("next")));
}

/** Keluar: cabut semua sesi user di server (sessionVersion++), lalu hapus cookie. */
export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) await service.revokeSessions(user.id);
  await destroySession();
  redirect("/login");
}
