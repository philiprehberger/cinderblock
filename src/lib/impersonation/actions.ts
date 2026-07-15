"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { requireOwnerMfa } from "@/lib/mfa/gate";
import { createServiceRoleClient } from "@/lib/supabase/server-only";
import { IMPERSONATION_COOKIE } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit/writer";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { signHs256 } from "@/lib/jwt/hs256";

// Step-up + impersonation server actions. The flow:
//   1. Admin clicks Impersonate → startImpersonation(targetUserId)
//   2. Server generates a 6-digit OTP, HMAC-hashes it, stores hash in
//      step_up_codes. In dev the OTP is also displayed in the UI.
//   3. Admin enters the OTP on the confirm page
//   4. verifyStepUpAndImpersonate(otp, targetUserId) verifies the hash,
//      marks the code used, mints the 60-min impersonation JWT signed
//      with SUPABASE_JWT_SECRET, sets cb_impersonate cookie, redirects
//      to the workspace home.
//   5. endImpersonation() clears the cookie, audits, redirects.

const OTP_TTL_SECONDS = 300;        // 5 min
const IMPERSONATION_TTL_SECONDS = 60 * 60;  // 60 min

function backWithError(slug: string, targetUserId: string, error: string): never {
  redirect(
    `/app/${slug}/impersonate/${encodeURIComponent(targetUserId)}?error=${encodeURIComponent(error)}`,
  );
}

async function hashOtp(otp: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(otp));
  return new Uint8Array(sig);
}

function bytesToBytea(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return `\\x${hex}`;
}

function generateOtp(): string {
  // 6 digits via crypto.getRandomValues (avoids modulo bias by rejection-sampling).
  const buf = new Uint8Array(4);
  while (true) {
    crypto.getRandomValues(buf);
    const n = ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0;
    // Largest multiple of 1_000_000 below 2^32
    const cap = 4_294_000_000;
    if (n < cap) return (n % 1_000_000).toString().padStart(6, "0");
  }
}

// startImpersonation — admin chooses a target. Generates OTP, persists the
// hash, redirects to the confirm page. In dev mode the OTP is appended as
// a query param so the smoke test (and a developer hitting the UI) can
// proceed without a real email provider.
export async function startImpersonation(formData: FormData): Promise<void> {
  const admin = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const targetUserId = String(formData.get("target_user_id") ?? "");
  if (!slug || !targetUserId) {
    redirect("/app");
  }
  if (targetUserId === admin.id) {
    backWithError(slug, targetUserId, "cannot_impersonate_self");
  }

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    backWithError(slug, targetUserId, "not_admin");
  }

  await requireOwnerMfa(
    admin.id,
    "impersonation",
    `/app/${slug}/members`,
  );

  const service = createServiceRoleClient();
  const { data: target } = await service
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId)
    .is("removed_at", null)
    .maybeSingle();
  if (!target) {
    backWithError(slug, targetUserId, "target_not_member");
  }

  // Owner targets require owner caller.
  if (target.role === "owner" && workspace.role !== "owner") {
    backWithError(slug, targetUserId, "owner_target_requires_owner");
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    backWithError(slug, targetUserId, "jwt_secret_unset");
  }

  const otp = generateOtp();
  const hashed = await hashOtp(otp, secret);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  // Invalidate any earlier pending codes for the same admin/target pair —
  // a fresh start always wins, no replay of a leaked previous code.
  await service
    .from("step_up_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id)
    .eq("initiated_by", admin.id)
    .eq("target_user_id", targetUserId)
    .eq("purpose", "impersonation")
    .is("used_at", null);

  const { error: insertError } = await service.from("step_up_codes").insert({
    workspace_id: workspace.id,
    initiated_by: admin.id,
    target_user_id: targetUserId,
    purpose: "impersonation",
    code_hash: bytesToBytea(hashed),
    expires_at: expiresAt,
  });
  if (insertError) {
    backWithError(slug, targetUserId, `insert_failed:${insertError.message}`);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "impersonation.step_up_started",
      targetType: "workspace_member",
      targetId: targetUserId,
    });
  } catch (err) {
    console.error("auditLog impersonation.step_up_started failed:", err);
  }

  // Dev mode: surface the OTP so the smoke test + a developer hitting the
  // UI can proceed without a real email provider. /docs/security/mfa names
  // the production replacement (Postmark / SendGrid integration).
  const devParam =
    process.env.NODE_ENV !== "production" ? `&__dev_otp=${otp}` : "";

  redirect(
    `/app/${slug}/impersonate/${encodeURIComponent(targetUserId)}?sent=1${devParam}`,
  );
}

export async function verifyStepUpAndImpersonate(
  formData: FormData,
): Promise<void> {
  const admin = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const targetUserId = String(formData.get("target_user_id") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();

  if (!slug || !targetUserId || !otp) {
    backWithError(slug, targetUserId, "missing_field");
  }
  if (!/^\d{6}$/.test(otp)) {
    backWithError(slug, targetUserId, "invalid_otp_format");
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    backWithError(slug, targetUserId, "jwt_secret_unset");
  }

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    backWithError(slug, targetUserId, "not_admin");
  }

  const hashed = await hashOtp(otp, secret);
  const service = createServiceRoleClient();

  // Verify the code atomically, counting failures and burning the code after
  // too many wrong guesses (migration 0160). Without a cap, the 6-digit OTP is
  // brute-forceable within its TTL and success mints a 60-minute impersonation
  // token. The RPC finds the pending code, compares the hash under a row lock,
  // increments attempts on a miss, and burns the code at the cap.
  const { data: status } = await service.rpc("verify_step_up_code", {
    _workspace_id: workspace.id,
    _initiated_by: admin.id,
    _target_user_id: targetUserId,
    _purpose: "impersonation",
    _code_hash: bytesToBytea(hashed),
    _max_attempts: 5,
  });

  if (status === "locked") {
    backWithError(slug, targetUserId, "too_many_attempts");
  }
  if (status === "expired") {
    backWithError(slug, targetUserId, "expired_otp");
  }
  if (status !== "ok") {
    // 'bad_code' | 'no_code' | null (rpc error)
    backWithError(slug, targetUserId, "invalid_or_used_otp");
  }

  // Mint the impersonation JWT. sub=target; aud='impersonation';
  // app_metadata.impersonated_by=admin; 60-min exp. PostgREST accepts this
  // because it's signed with SUPABASE_JWT_SECRET.
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signHs256(
    {
      sub: targetUserId,
      aud: "impersonation",
      role: "authenticated",
      exp: now + IMPERSONATION_TTL_SECONDS,
      iat: now,
      app_metadata: { impersonated_by: admin.id },
    },
    secret,
  );

  // Audit the start under the admin's identity. Must happen BEFORE setting
  // the cookie — auditLog reads cb_impersonate and would otherwise record
  // the impersonated user as the actor of their own being-impersonated.
  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "impersonation.started",
      targetType: "workspace_member",
      targetId: targetUserId,
      diff: { ttl_seconds: IMPERSONATION_TTL_SECONDS },
    });
  } catch (err) {
    console.error("auditLog impersonation.started failed:", err);
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
    domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
  });

  revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}`);
}

export async function endImpersonation(formData: FormData): Promise<void> {
  const slug = String(formData.get("workspace_slug") ?? "");

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
  });

  // Audit log the end now that the cookie is cleared — the next request the
  // admin makes will be under their normal identity, so we capture the end
  // event with the admin as actor on this same request.
  try {
    const workspace = slug ? await getWorkspaceBySlug(slug).catch(() => null) : null;
    if (workspace) {
      await auditLog({
        workspaceId: workspace.id,
        action: "impersonation.ended",
        targetType: "workspace",
        targetId: workspace.id,
      });
    }
  } catch (err) {
    console.error("auditLog impersonation.ended failed:", err);
  }

  if (slug) {
    revalidatePath(`/app/${slug}`);
    redirect(`/app/${slug}`);
  }
  redirect("/app");
}
