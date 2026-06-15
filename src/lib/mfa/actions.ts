"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server-only";
import { auditLog } from "@/lib/audit/writer";
import { listTotpFactors, userHoldsAnyOwnerRole } from "./queries";

// MFA server actions. Supabase Auth handles the TOTP secret + verification
// for us — we trigger enrol, persist the QR/secret in an HttpOnly cookie
// (Supabase returns them once and they aren't retrievable after enrol), let
// the user copy them into their authenticator app, then verify the 6-digit
// code. Audit events fire for every state change so an owner can see
// "TOTP enrolled / removed" in the audit log of every workspace they own.

const SETTINGS_PATH = "/app/settings/mfa";

// HttpOnly cookie storing the in-flight enrol payload (factor_id + QR data
// URL + base32 secret). Cleared on verify-success or cancel. 15-minute TTL
// caps the window where a stale enrol can be resumed; if the user reloads
// after the TTL, the unverified factor is unenrolled and they start fresh.
const ENROL_COOKIE = "cb_mfa_enrol";
const ENROL_TTL_SECONDS = 15 * 60;

export type EnrolPayload = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

function back(error?: string, ok?: string): never {
  const qs = new URLSearchParams();
  if (error) qs.set("error", error);
  if (ok) qs.set("ok", ok);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  redirect(`${SETTINGS_PATH}${suffix}`);
}

async function ownedWorkspaceIds(userId: string): Promise<string[]> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(deleted_at)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .is("removed_at", null)
    .is("workspaces.deleted_at", null);
  return (data ?? []).map((r) => r.workspace_id as string);
}

async function auditAcrossOwnedWorkspaces(
  userId: string,
  action: string,
  diff: Record<string, unknown>,
): Promise<void> {
  const workspaceIds = await ownedWorkspaceIds(userId);
  for (const wid of workspaceIds) {
    try {
      await auditLog({
        workspaceId: wid,
        action,
        targetType: "user",
        targetId: userId,
        diff,
      });
    } catch (err) {
      console.error(`auditLog ${action} failed for workspace ${wid}:`, err);
    }
  }
}

// readEnrolCookie + writeEnrolCookie — small wrappers so the cookie name and
// shape are kept in one place. The cookie holds the QR data URL Supabase
// returned at enrol time; without it the user would lose the QR on refresh.
export async function readEnrolCookie(): Promise<EnrolPayload | null> {
  const store = await cookies();
  const raw = store.get(ENROL_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EnrolPayload;
    if (!parsed.factorId || !parsed.qrCode || !parsed.secret) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeEnrolCookie(payload: EnrolPayload): Promise<void> {
  const store = await cookies();
  store.set(ENROL_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SETTINGS_PATH,
    maxAge: ENROL_TTL_SECONDS,
  });
}

async function clearEnrolCookie(): Promise<void> {
  const store = await cookies();
  store.set(ENROL_COOKIE, "", { path: SETTINGS_PATH, maxAge: 0 });
}

// enrollTotp — starts a fresh TOTP factor. Stores the QR + secret in the
// HttpOnly cookie so the page render shows them. If a verified factor
// already exists the user must unenrol first; if an unverified factor
// exists this resumes that enrolment by reading the existing cookie (or
// errors if the cookie has expired — Supabase doesn't expose a way to
// re-fetch the secret).
export async function enrollTotp(): Promise<void> {
  const user = await requireAuth();
  const supabase = await createClient();

  const existing = await listTotpFactors();
  if (existing.some((f) => f.status === "verified")) {
    back("already_enrolled");
  }

  // If there's an unverified factor + a valid cookie, the page already
  // shows the QR — bounce without re-enrolling.
  const existingUnverified = existing.find((f) => f.status === "unverified");
  if (existingUnverified) {
    const cookie = await readEnrolCookie();
    if (cookie?.factorId === existingUnverified.id) {
      redirect(SETTINGS_PATH);
    }
    // Stale unverified factor without the cookie payload — Supabase has no
    // way to re-fetch the secret, so clean it up before enrolling again.
    await supabase.auth.mfa.unenroll({ factorId: existingUnverified.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Cinderblock",
    friendlyName: `cinderblock-${Date.now()}`,
  });
  if (error || !data) {
    console.error("enrollTotp failed:", error);
    back(`enroll_failed:${error?.message ?? "unknown"}`);
  }

  const totpData = data as {
    id: string;
    totp: { qr_code: string; secret: string; uri: string };
  };

  await writeEnrolCookie({
    factorId: totpData.id,
    qrCode: totpData.totp.qr_code,
    secret: totpData.totp.secret,
    uri: totpData.totp.uri,
  });

  await auditAcrossOwnedWorkspaces(user.id, "mfa.enrolment_started", {
    factor_type: "totp",
    factor_id: totpData.id,
  });
  redirect(SETTINGS_PATH);
}

// verifyTotp — finishes enrolment. The user enters the 6-digit code from
// their authenticator; on success the factor flips to verified and
// user_has_mfa(auth.uid()) returns true at the DB layer.
export async function verifyTotp(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const factorId = String(formData.get("factor_id") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!factorId) back("missing_factor");
  if (!/^\d{6}$/.test(code)) back("invalid_code_format");

  const supabase = await createClient();

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    console.error("verifyTotp challenge failed:", challenge.error);
    back(`challenge_failed:${challenge.error?.message ?? "unknown"}`);
  }

  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) {
    if (verify.error.message?.toLowerCase().includes("invalid")) {
      back("wrong_code");
    }
    console.error("verifyTotp verify failed:", verify.error);
    back(`verify_failed:${verify.error.message}`);
  }

  await clearEnrolCookie();
  await auditAcrossOwnedWorkspaces(user.id, "mfa.enrolled", {
    factor_type: "totp",
    factor_id: factorId,
  });

  revalidatePath(SETTINGS_PATH);
  back(undefined, "enrolled");
}

// cancelEnroll — abandons an in-flight enrolment. Unenrols the pending
// factor and clears the cookie so the user can start over.
export async function cancelEnroll(): Promise<void> {
  const user = await requireAuth();
  const cookie = await readEnrolCookie();
  const supabase = await createClient();

  if (cookie?.factorId) {
    await supabase.auth.mfa.unenroll({ factorId: cookie.factorId });
  }
  await clearEnrolCookie();
  await auditAcrossOwnedWorkspaces(user.id, "mfa.enrolment_cancelled", {
    factor_type: "totp",
  });
  redirect(SETTINGS_PATH);
}

// unenrollTotp — removes a verified factor. If the caller is an owner
// anywhere and this would leave them with zero verified factors, the
// action refuses with owner_must_keep_mfa.
export async function unenrollTotp(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const factorId = String(formData.get("factor_id") ?? "");
  if (!factorId) back("missing_factor");

  const factors = await listTotpFactors();
  const target = factors.find((f) => f.id === factorId);
  if (!target) back("factor_not_found");

  const remainingVerified = factors.filter(
    (f) => f.id !== factorId && f.status === "verified",
  ).length;

  if (target.status === "verified" && remainingVerified === 0) {
    const stillOwner = await userHoldsAnyOwnerRole();
    if (stillOwner) {
      back("owner_must_keep_mfa");
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    console.error("unenrollTotp failed:", error);
    back(`unenroll_failed:${error.message}`);
  }

  await auditAcrossOwnedWorkspaces(user.id, "mfa.unenrolled", {
    factor_type: "totp",
    was_status: target.status,
  });

  revalidatePath(SETTINGS_PATH);
  back(undefined, "unenrolled");
}
