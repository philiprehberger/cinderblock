import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyInternalCaller } from "../_shared/internal-auth.ts";
import { signInvitationToken, hexToBytea } from "../_shared/hmac.ts";

// invite-create — signs an invitation token, persists the hash, sends email.
//
// Flow:
// 1. Verify CORS + EDGE_INTERNAL_SECRET HMAC.
// 2. Parse { workspace_id, email, role, invited_by_user_id, site_url }.
// 3. Check the inviter is admin+ in the workspace (via service-role query).
// 4. Reject if email already has an active membership in the workspace.
// 5. Reject if email already has a pending (unaccepted, unexpired) invite.
// 6. Sign the token with INVITE_SIGNING_KEY (the Edge Function is the only
//    place the signing key lives — even a compromised Next.js server can't
//    forge tokens).
// 7. INSERT the invitation row (token_hash stored as bytea).
// 8. Send the email via Supabase Auth admin invite or a custom send.
// 9. Return { invitation_id, expires_at } to the caller.

type CreateInviteRequest = {
  workspace_id: string;
  email: string;
  role: "admin" | "member" | "guest";
  invited_by_user_id: string;
  site_url: string;  // e.g. http://localhost:3000 — used to build the accept URL
};

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  const auth = await verifyInternalCaller(request);
  if (!auth.ok) return auth.response;

  let payload: CreateInviteRequest;
  try {
    payload = JSON.parse(auth.body);
  } catch {
    return json({ error: "invalid_json" }, 400, request);
  }

  const { workspace_id, email, role, invited_by_user_id, site_url } = payload;
  if (!workspace_id || !email || !role || !invited_by_user_id || !site_url) {
    return json({ error: "missing_fields" }, 400, request);
  }
  if (!["admin", "member", "guest"].includes(role)) {
    return json({ error: "invalid_role" }, 400, request);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signingKey = Deno.env.get("INVITE_SIGNING_KEY");
  if (!supabaseUrl || !serviceRoleKey || !signingKey) {
    return json({ error: "env_unconfigured" }, 500, request);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authorize: inviter is admin+ in the workspace.
  const { data: inviterRow } = await service
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", invited_by_user_id)
    .is("removed_at", null)
    .maybeSingle();
  if (!inviterRow) {
    return json({ error: "not_a_member" }, 403, request);
  }
  // Native enum order: owner=1 < admin=2 < member=3 < guest=4
  if (!["owner", "admin"].includes(inviterRow.role)) {
    return json({ error: "not_admin" }, 403, request);
  }

  // Reject already-a-member by email lookup against auth.users.
  // Supabase exposes auth.admin.listUsers; for email we filter ourselves.
  const { data: existingUser } = await service.auth.admin.listUsers({
    page: 1, perPage: 200,
  });
  const matchedUser = existingUser.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (matchedUser) {
    const { data: existingMember } = await service
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", matchedUser.id)
      .is("removed_at", null)
      .maybeSingle();
    if (existingMember) {
      return json({ error: "already_member" }, 409, request);
    }
  }

  // Reject duplicate pending invite (workspace_id, email, accepted_at is null).
  const { data: existingInvite } = await service
    .from("workspace_invitations")
    .select("id, expires_at")
    .eq("workspace_id", workspace_id)
    .ilike("email", email)
    .is("accepted_at", null)
    .maybeSingle();
  if (existingInvite && new Date(existingInvite.expires_at).getTime() > Date.now()) {
    return json({ error: "already_invited", invitation_id: existingInvite.id }, 409, request);
  }

  // Sign the token. The hash goes into token_hash; the raw token goes into
  // the email. Even if the workspace_invitations row leaks, the raw token
  // can't be reconstructed from the hash.
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const tokenPayload = {
    workspace_id,
    email: email.toLowerCase(),
    role,
    expires_at: expiresAt.toISOString(),
    nonce,
  };
  const { token, tokenHashHex } = await signInvitationToken(tokenPayload, signingKey);

  // INSERT the invitation row. The unique partial index on (workspace_id,
  // email) where accepted_at is null catches a race where two concurrent
  // invites for the same email arrive at once — one wins, the other gets
  // 23505 which we surface as already_invited.
  const { data: insertResult, error: insertError } = await service
    .from("workspace_invitations")
    .insert({
      workspace_id,
      email: email.toLowerCase(),
      role,
      invited_by: invited_by_user_id,
      token_hash: hexToByteaForJson(tokenHashHex),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      return json({ error: "already_invited" }, 409, request);
    }
    return json({ error: "insert_failed", detail: insertError.message }, 500, request);
  }

  // Send the email. Use Supabase Auth's invite flow — if the recipient
  // doesn't exist yet, the magic link creates the user; if they do, it
  // signs them in. The "next" param routes them to the accept page after
  // the magic-link callback.
  const acceptPath = `/app/accept/${encodeURIComponent(token)}`;
  const redirectTo = `${site_url}${acceptPath}`;
  await service.auth.admin.inviteUserByEmail(email.toLowerCase(), {
    redirectTo,
    data: { workspace_id, role, invited_by_user_id },
  });

  return json({ invitation_id: insertResult.id, expires_at: expiresAt.toISOString() }, 200, request);
});

function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

// supabase-js's INSERT accepts a string for bytea fields as long as it's
// in the `\\x<hex>` Postgres escape form, but the cleaner path is to pass
// the hex through and let postgrest decode it. Newer postgrest versions
// also accept base64. We send `\\x<hex>` for the broadest compatibility.
function hexToByteaForJson(hex: string): string {
  return `\\x${hex}`;
}
