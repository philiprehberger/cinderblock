// Generates random 32-char passwords for cb_audit_writer + cb_impersonator
// on the Cloud project, ALTERs both to LOGIN, and prints the resulting
// connection strings to stdout (caller pipes them into the prod .env).
//
// Idempotent: re-running rotates fresh passwords.

import postgres from "postgres";
import { randomBytes } from "node:crypto";

const required = ["SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_POOLER_HOST"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`missing env: ${k}`);
    process.exit(1);
  }
}

function gen32() {
  return randomBytes(24).toString("base64").replace(/[+/=]/g, "").slice(0, 32);
}

const url =
  `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:` +
  `${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@` +
  `${process.env.SUPABASE_DB_POOLER_HOST}:5432/postgres`;

const sql = postgres(url, {
  max: 1,
  idle_timeout: 10,
  connect_timeout: 15,
  prepare: false,
});

const audit = gen32();
const imp = gen32();

await sql.unsafe(`alter role cb_audit_writer with login password '${audit}';`);
await sql.unsafe(`alter role cb_impersonator with login password '${imp}';`);

// Pooler URL format: postgres.<ref> as the user, pooler host:5432 (session
// mode — required for the audit writer's transaction control + the
// impersonator's `set local request.jwt.claims` pattern).
const auditUrl =
  `postgresql://cb_audit_writer.${process.env.SUPABASE_PROJECT_REF}:` +
  `${encodeURIComponent(audit)}@${process.env.SUPABASE_DB_POOLER_HOST}:5432/postgres`;
const impUrl =
  `postgresql://cb_impersonator.${process.env.SUPABASE_PROJECT_REF}:` +
  `${encodeURIComponent(imp)}@${process.env.SUPABASE_DB_POOLER_HOST}:5432/postgres`;

await sql.end();

// Verify both roles can actually log in via the pooler.
for (const [name, testUrl] of [["cb_audit_writer", auditUrl], ["cb_impersonator", impUrl]]) {
  const test = postgres(testUrl, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false });
  try {
    const r = await test`select current_user`;
    process.stderr.write(`  ${name}: connected as ${r[0].current_user}\n`);
  } catch (e) {
    process.stderr.write(`  ${name}: FAILED — ${e.message}\n`);
    process.exit(1);
  } finally {
    try { await test.end(); } catch (_) {}
  }
}

// Emit env-var assignments on stdout for caller to capture.
console.log(`PG_AUDIT_WRITER_URL=${auditUrl}`);
console.log(`PG_IMPERSONATOR_URL=${impUrl}`);
