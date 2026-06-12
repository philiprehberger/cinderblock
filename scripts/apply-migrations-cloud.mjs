// Apply Cinderblock migrations to a remote Supabase Cloud project via the
// connection pooler. Stops on the first failure. Idempotent for migrations
// that use `create ... if not exists`; not idempotent overall (running
// twice on the same project will fail on the first non-idempotent CREATE).

import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(REPO, "supabase/migrations");

const required = ["SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_POOLER_HOST"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`missing env: ${k}`);
    process.exit(1);
  }
}

const url =
  `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:` +
  `${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@` +
  `${process.env.SUPABASE_DB_POOLER_HOST}:5432/postgres`;

const sql = postgres(url, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 30,
  // The pooler is in session mode at :5432; prepared statements work but we
  // run each migration as a single multi-statement command to keep it close
  // to how `supabase db push` does it locally.
  prepare: false,
});

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

console.log(`applying ${files.length} migrations to ${process.env.SUPABASE_PROJECT_REF}`);
let n = 0;
for (const file of files) {
  n++;
  process.stdout.write(`  ${String(n).padStart(2)}/${files.length}  ${file} ... `);
  const body = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
  try {
    await sql.unsafe(body);
    console.log("OK");
  } catch (err) {
    console.log(`FAIL`);
    console.error(`\n  error: ${err.message}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    if (err.position) console.error(`  position: ${err.position}`);
    await sql.end();
    process.exit(1);
  }
}

await sql.end();
console.log("\nall migrations applied.");
