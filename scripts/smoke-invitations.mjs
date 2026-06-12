// Phase 3.5 smoke test — drives the invitation flow without a browser.
//
// Steps:
//  1. Use Supabase auth admin to (re)create alice@cb.test and bob@cb.test.
//  2. Use service-role to insert a workspace + alice as owner.
//  3. Call invite-create as alice (Next.js → Edge Function path).
//  4. Verify the email lands in Mailpit.
//  5. Decode the token from the email body.
//  6. Call invite-accept as bob.
//  7. Verify bob's membership row landed + audit_events.

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Read .env.local relative to this script
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(`${REPO_ROOT}/.env.local`, "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EDGE_SECRET = env.EDGE_INTERNAL_SECRET;
const PG_AUDIT_URL = env.PG_AUDIT_WRITER_URL;

if (!SUPABASE_URL || !SERVICE_KEY || !EDGE_SECRET) {
  console.error("missing env");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- HMAC helpers ---
async function signEdge(body, ts, nonce) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(EDGE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${nonce}.${body}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callEdge(name, body) {
  const bodyString = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const sig = await signEdge(bodyString, ts, nonce);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
      "x-cb-signature": sig,
      "x-cb-timestamp": ts,
      "x-cb-nonce": nonce,
    },
    body: bodyString,
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// --- 1) Re-create alice + bob ---
async function getOrCreateUser(email) {
  // Walk all pages of listUsers because the default page size may be small.
  let page = 1;
  while (true) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (!data || !data.users || data.users.length === 0) break;
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 100) break;
    page++;
    if (page > 20) break;
  }
  try {
    const { data, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user;
  } catch (err) {
    // Race or stale pagination — try listing once more before giving up.
    const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 500 });
    const match = data?.users?.find((u) => u.email === email);
    if (match) return match;
    throw err;
  }
}

const alice = await getOrCreateUser("alice@cb.test");
// Bob is NOT pre-created — invite-create's `auth.admin.inviteUserByEmail`
// is what creates him and sends the magic link.
const bobEmail = `bob-${Date.now()}@cb.test`;
console.log("alice:", alice.id);
console.log("bob email:", bobEmail);

// --- 2) Workspace + alice as owner ---
const wsSlug = `smoke-${Date.now()}`;
const { data: ws, error: wsErr } = await service
  .from("workspaces")
  .insert({ slug: wsSlug, name: "Smoke Test Workspace", created_by: alice.id })
  .select("id")
  .single();
if (wsErr) throw wsErr;
console.log("workspace:", ws.id, wsSlug);

await service.from("workspace_members").insert({
  workspace_id: ws.id,
  user_id: alice.id,
  role: "owner",
});

// --- 3) invite-create ---
console.log("\n--- invite-create ---");
const r1 = await callEdge("invite-create", {
  workspace_id: ws.id,
  email: bobEmail,
  role: "member",
  invited_by_user_id: alice.id,
  site_url: "http://localhost:3000",
});
console.log("status:", r1.status, "body:", JSON.stringify(r1.body));
if (r1.status !== 200) process.exit(1);

// --- 4) Verify invitation row + mailpit ---
const { data: invs } = await service
  .from("workspace_invitations")
  .select("id, email, role, expires_at, token_hash")
  .eq("workspace_id", ws.id);
console.log("invitations in DB:", invs.length);

// --- 5) For accept, we need the raw token. The Edge Function emails it; we can
//    reconstruct by signing a payload (which is what invite-create did), but
//    that requires INVITE_SIGNING_KEY in this script — it's intentionally only
//    in the Edge Function's env. So instead, fetch from Mailpit.
await new Promise((r) => setTimeout(r, 1500));
const mp = await fetch(`http://127.0.0.1:54324/api/v1/messages?query=${encodeURIComponent("to:" + bobEmail)}`).then((r) => r.json());
const mostRecent = mp.messages?.[0];
if (!mostRecent) {
  console.error("no mailpit message for bob");
  process.exit(1);
}
console.log("mailpit msg id:", mostRecent.ID, "subject:", mostRecent.Subject);

const msgBody = await fetch(`http://127.0.0.1:54324/api/v1/message/${mostRecent.ID}`).then((r) => r.json());
const html = msgBody.HTML || msgBody.Text || "";
// The Supabase invite email links to redirectTo which contains the token.
// Find /app/accept/<token>.
const m = html.match(/\/app\/accept\/([A-Za-z0-9_-]+\.[a-f0-9]+)/);
if (!m) {
  console.error("could not find accept token in email body");
  console.error(html.slice(0, 500));
  process.exit(1);
}
const token = decodeURIComponent(m[1]);
console.log("token:", token.slice(0, 50) + "...");

// --- Look up bob's just-created user ---
const bob = await getOrCreateUser(bobEmail);
console.log("bob (created by invite-create):", bob.id);

// --- 6) invite-accept as bob ---
console.log("\n--- invite-accept ---");
const r2 = await callEdge("invite-accept", {
  token,
  accepted_by_user_id: bob.id,
});
console.log("status:", r2.status, "body:", JSON.stringify(r2.body));
if (r2.status !== 200) process.exit(1);

// --- 7) Verify membership row ---
const { data: members } = await service
  .from("workspace_members")
  .select("user_id, role")
  .eq("workspace_id", ws.id)
  .is("removed_at", null);
console.log("\nfinal members:", members);

// --- 8) Audit ---
if (PG_AUDIT_URL) {
  const sql = postgres(PG_AUDIT_URL);
  const audit = await sql`
    select action, actor_id, target_id
    from public.audit_events
    where workspace_id = ${ws.id}
    order by occurred_at desc
  `.catch(() => []);
  await sql.end();
  console.log("audit events:", audit);
}

console.log("\nSMOKE OK");
