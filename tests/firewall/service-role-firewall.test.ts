import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Firewall test: assert that the service-role client is only imported from
// server modules. `import "server-only"` makes Next.js fail the build on
// violations, but this test runs in CI before the build and gives a clearer
// failure message naming the file + line where the rule was broken.
//
// The allow-list is the small set of server-only modules permitted to import
// from server-only.ts. Adding to this list should be a deliberate decision
// reviewed in the PR.

const SERVICE_ROLE_IMPORT_PATTERNS = [
  /from\s+["'][^"']*supabase\/server-only["']/,
  /import\(\s*["'][^"']*supabase\/server-only["']\s*\)/,
  /createServiceRoleClient/,
];

const ALLOW_LIST = new Set<string>([
  // server-only.ts itself defines the export.
  "src/lib/supabase/server-only.ts",
  // The firewall test file is allowed to mention the symbol.
  "tests/firewall/service-role-firewall.test.ts",
  // Server actions that need service-role for writes the policy closes
  // entirely. Each entry should be paired with a one-line justification
  // in the file itself naming why RLS was insufficient.
  "src/lib/workspaces/actions.ts",  // workspace_members.INSERT is `with check (false)`
  "src/lib/invitations/actions.ts", // workspace_invitations.UPDATE policy is closed; revoke + accept need service-role
  "src/lib/users/queries.ts",       // auth.users is invisible to non-service roles; emails resolved batch-wise
  "src/lib/members/actions.ts",     // role-change + remove cross the admin-only policy via service-role with audit
]);

const SCAN_ROOTS = ["src/app", "src/components", "src/lib"];
const SKIP_EXTENSIONS = new Set([".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"]);

function walk(dir: string, files: string[] = []) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, files);
    } else {
      const dot = entry.lastIndexOf(".");
      if (dot >= 0 && SKIP_EXTENSIONS.has(entry.slice(dot))) continue;
      files.push(full);
    }
  }
  return files;
}

describe("service-role client firewall", () => {
  it("only allow-listed modules import the service-role client", () => {
    const repoRoot = resolve(__dirname, "..", "..");
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      const absRoot = join(repoRoot, root);
      const files = walk(absRoot);
      for (const file of files) {
        const rel = file.slice(repoRoot.length + 1).replace(/\\/g, "/");
        if (ALLOW_LIST.has(rel)) continue;

        // Skip the file containing the "use client" directive's clients —
        // the regex above already excludes them, but in case a future client
        // file accidentally references the firewall symbol in a comment, we
        // could add a sentinel allow-list per-pattern. Keeping it strict
        // for now.

        const content = readFileSync(file, "utf-8");
        if (SERVICE_ROLE_IMPORT_PATTERNS.some((p) => p.test(content))) {
          offenders.push(rel);
        }
      }
    }

    expect(offenders, `Service-role client imported outside the allow-list: ${offenders.join(", ")}`).toEqual([]);
  });
});
