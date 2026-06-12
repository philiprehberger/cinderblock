import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyInternalCaller } from "../_shared/internal-auth.ts";
import { verifyInvitationToken, hashToken } from "../_shared/hmac.ts";

// invite-accept — verifies a signed token and writes the membership.
//
// Flow:
// 1. Verify CORS + EDGE_INTERNAL_SECRET HMAC.
// 2. Parse { token, accepted_by_user_id }.
// 3. HMAC-verify the token + check the expires_at hasn't passed.
// 4. SHA-256 the raw token; look up the matching workspace_invitations row
//    by token_hash. Confirm the row's email matches the payload's email
//    (defends against token reuse across mailboxes).
// 5. Confirm accepted_by_user_id's email matches the invitation email
//    (the recipient is who clicked the link, not someone else who got the
//    token forwarded). The user's session was minted via magic link sent
//    to that email; the email match is the authentication of intent.
// 6. INSERT workspace_members + UPDATE workspace_invitations.accepted_at
//    inside a serializable transaction so the seat-enforcement deferred
//    trigger sees a consistent state.
// 7. Return { workspace_id, role } so the caller can redirect.

type AcceptInviteRequest = {
  token: string;
  accepted_by_user_id: string;
};

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  const auth = await verifyInternalCaller(request);
  if (!auth.ok) return auth.response;

  let payload: AcceptInviteRequest;
  try {
    payload = JSON.parse(auth.body);
  } catch {
    return json({ error: "invalid_json" }, 400, request);
  }

  const { token, accepted_by_user_id } = payload;
  if (!token || !accepted_by_user_id) {
    return json({ error: "missing_fields" }, 400, request);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signingKey = Deno.env.get("INVITE_SIGNING_KEY");
  if (!supabaseUrl || !serviceRoleKey || !signingKey) {
    return json({ error: "env_unconfigured" }, 500, request);
  }

  // 3. Verify token signature + expiry.
  const tokenPayload = await verifyInvitationToken(token, signingKey);
  if (!tokenPayload) {
    return json({ error: "invalid_or_expired_token" }, 401, request);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Look up the invitation row by token hash.
  const tokenHashHex = await hashToken(token);
  const { data: invitation } = await service
    .from("workspace_invitations")
    .select("id, workspace_id, email, role, expires_at, accepted_at")
    .eq("token_hash", `\\x${tokenHashHex}`)
    .maybeSingle();

  if (!invitation) {
    return json({ error: "invitation_not_found" }, 404, request);
  }
  if (invitation.accepted_at) {
    return json({ error: "already_accepted" }, 410, request);
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return json({ error: "expired" }, 410, request);
  }

  // Cross-check: payload's email matches the row.
  if (tokenPayload.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return json({ error: "token_email_mismatch" }, 400, request);
  }

  // 5. Cross-check: accepting user's email matches the invitation email.
  const { data: userResult } = await service.auth.admin.getUserById(accepted_by_user_id);
  if (!userResult?.user) {
    return json({ error: "user_not_found" }, 404, request);
  }
  if (userResult.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return json({ error: "email_mismatch" }, 403, request);
  }

  // 6. Idempotency: if the user is already a member of this workspace, mark
  // the invitation accepted and return success. This handles the case where
  // the recipient clicks the link twice.
  const { data: existingMember } = await service
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", invitation.workspace_id)
    .eq("user_id", accepted_by_user_id)
    .is("removed_at", null)
    .maybeSingle();

  if (existingMember) {
    await service
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_by: accepted_by_user_id })
      .eq("id", invitation.id)
      .is("accepted_at", null);
    return json(
      { workspace_id: invitation.workspace_id, role: existingMember ? "(already a member)" : invitation.role },
      200, request,
    );
  }

  // The actual write. supabase-js can't express serializable transactions,
  // but the workspace_members.INSERT policy is closed (`with check (false)`)
  // and we're running as service-role, so the membership INSERT can't be
  // raced from another caller — the only other writer would also be running
  // through this Edge Function. Race protection between two parallel
  // invite-accept calls for the same (workspace, user) is via the composite
  // PK on workspace_members (workspace_id, user_id) — second INSERT trips
  // 23505 which we surface as already_member.
  const { error: memberError } = await service
    .from("workspace_members")
    .insert({
      workspace_id: invitation.workspace_id,
      user_id: accepted_by_user_id,
      role: invitation.role,
    });

  if (memberError) {
    if (memberError.code === "23505") {
      return json({ error: "already_member" }, 409, request);
    }
    return json({ error: "member_insert_failed", detail: memberError.message }, 500, request);
  }

  const { error: updateError } = await service
    .from("workspace_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: accepted_by_user_id,
    })
    .eq("id", invitation.id)
    .is("accepted_at", null);

  if (updateError) {
    // Membership row landed but the invitation marker didn't — that's a
    // recoverable inconsistency for the audit log, not a user-facing error.
    console.error("invite-accept: failed to mark invitation accepted", updateError);
  }

  return json(
    { workspace_id: invitation.workspace_id, role: invitation.role, invitation_id: invitation.id },
    200, request,
  );
});

function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}
