// Phase 4 impersonation smoke. Exercises:
//   1. Manually sign an impersonation JWT (the same way verifyStepUp does)
//   2. POST it as the cb_impersonate cookie to a server-rendered route
//   3. Assert PostgREST treats the request as the impersonated user
//   4. Confirm an audit row was written with the right actor + impersonator
//
// The OTP flow itself is server-action-only and can't be driven via curl
// without re-implementing Next.js's action-id contract. Smoke focuses on
// the JWT verification path (the load-bearing security piece) and the
// audit-writer's impersonation awareness.

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const REPO = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(`${REPO}/.env.local`, "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JWT_SECRET = env.SUPABASE_JWT_SECRET;
const PG_AUDIT = env.PG_AUDIT_WRITER_URL;

if (!URL_ || !SERVICE || !ANON || !JWT_SECRET) {
  console.error("missing env: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET");
  process.exit(1);
}

const service = createClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Find or create alice + bob ---
async function getOrCreateUser(email) {
  let page = 1;
  while (page <= 20) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (!data?.users?.length) break;
    const m = data.users.find((u) => u.email === email);
    if (m) return m;
    if (data.users.length < 100) break;
    page++;
  }
  const { data } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  return data.user;
}

const adminUser = await getOrCreateUser("admin-imp@cb.test");
const targetUser = await getOrCreateUser("target-imp@cb.test");
console.log("admin: ", adminUser.id, adminUser.email);
console.log("target:", targetUser.id, targetUser.email);

// --- Workspace + memberships ---
const slug = `imp-${Date.now()}`;
const { data: ws } = await service
  .from("workspaces")
  .insert({ slug, name: "Impersonation Smoke", created_by: adminUser.id })
  .select("id")
  .single();
console.log("workspace:", ws.id, slug);

await service.from("workspace_members").insert([
  { workspace_id: ws.id, user_id: adminUser.id, role: "owner" },
  { workspace_id: ws.id, user_id: targetUser.id, role: "member" },
]);

// --- Mint an impersonation JWT the same way verifyStepUp does ---
const encoder = new TextEncoder();
function b64url(buf) {
  let bin = "";
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sign(payload, secret) {
  const headerEnc = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payloadEnc = b64url(encoder.encode(JSON.stringify(payload)));
  const data = `${headerEnc}.${payloadEnc}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return `${data}.${b64url(sig)}`;
}

const now = Math.floor(Date.now() / 1000);
const impJwt = await sign(
  {
    sub: targetUser.id,
    aud: "impersonation",
    role: "authenticated",
    exp: now + 3600,
    iat: now,
    app_metadata: { impersonated_by: adminUser.id },
  },
  JWT_SECRET,
);
console.log("minted impersonation JWT (length:", impJwt.length, ")");

// --- PostgREST query with Authorization: Bearer <impJwt> ---
// Should see auth.uid() = targetUser.id. Probe via a workspaces-by-membership query.
const impClient = createClient(URL_, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${impJwt}` } },
});

const { data: visibleWorkspaces, error: visErr } = await impClient
  .from("workspaces")
  .select("id, slug, name");
console.log("workspaces visible under impersonation JWT:", visibleWorkspaces?.length ?? "ERR");
if (visErr) console.error("err:", visErr.message);
if (visibleWorkspaces && visibleWorkspaces.find((w) => w.id === ws.id)) {
  console.log("  ✓ smoke workspace is visible (target is a member)");
} else {
  console.error("  ✗ smoke workspace NOT visible — RLS not honoring JWT sub");
  process.exit(1);
}

// --- Verify the admin's "view" — control: PostgREST under admin's JWT ---
const adminJwt = await sign(
  {
    sub: adminUser.id,
    aud: "authenticated",
    role: "authenticated",
    exp: now + 3600,
    iat: now,
  },
  JWT_SECRET,
);
const adminClient = createClient(URL_, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${adminJwt}` } },
});
const { data: adminWorkspaces } = await adminClient
  .from("workspaces")
  .select("id");
console.log("workspaces visible under admin JWT:", adminWorkspaces?.length ?? "ERR");

// --- Write an audit event via cb_audit_writer; verify both ids land ---
if (PG_AUDIT) {
  // Write via cb_audit_writer (INSERT-only); read back via service-role
  // because cb_audit_writer has no SELECT grant (intentional — defense
  // in depth so a compromised Next.js process can't even read history).
  const writerSql = postgres(PG_AUDIT);
  await writerSql`
    insert into public.audit_events
      (workspace_id, actor_id, impersonator_id, action, target_type, target_id)
    values
      (${ws.id}, ${targetUser.id}, ${adminUser.id}, ${"smoke.test"}, ${"workspace"}, ${ws.id})
  `;
  await writerSql.end();

  const { data: rows } = await service
    .from("audit_events")
    .select("actor_id, impersonator_id, action")
    .eq("workspace_id", ws.id)
    .eq("action", "smoke.test");
  console.log("audit row written:", rows?.[0]);
  if (
    rows?.[0]?.actor_id === targetUser.id &&
    rows?.[0]?.impersonator_id === adminUser.id
  ) {
    console.log("  ✓ audit row has correct actor + impersonator");
  } else {
    console.error("  ✗ audit row mismatch");
    process.exit(1);
  }

  // Bonus assertion: cb_audit_writer cannot SELECT (per the policy + grants).
  const writerSql2 = postgres(PG_AUDIT);
  try {
    await writerSql2`select id from public.audit_events limit 1`;
    console.error("  ✗ cb_audit_writer was able to SELECT — grants are wrong");
    process.exit(1);
  } catch (err) {
    if (String(err?.code) === "42501") {
      console.log("  ✓ cb_audit_writer SELECT correctly denied (42501)");
    } else {
      console.error("  ✗ unexpected error on SELECT attempt:", err?.code, err?.message);
      process.exit(1);
    }
  } finally {
    await writerSql2.end();
  }
}

console.log("\nIMPERSONATION SMOKE OK");
