import { expect, test } from "@playwright/test";

// Cross-tenant URL guessing produces a 404, never a silent display of the
// other tenant's data.
//
// This test signs in as a fixture user via Supabase Auth admin and asserts
// that navigating to a workspace they don't belong to 404s. It uses the
// existing acme/bigco fixture rather than provisioning fresh users.
//
// Prerequisites:
//   - npx supabase start (DB + Auth running)
//   - npm run dev (Next.js on :3000)
//   - .env.local populated (so the server can verify the JWT we mint)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Playwright 1.60 + Node 25 don't reliably resolve `import.meta.url` inside
// transformed test modules. Read .env.local relative to cwd instead — the
// dev server is always launched from the repo root, so this is stable.
const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;

// Mint a session for the given user via the Supabase Auth admin
// generateLink flow. The action_link goes through GoTrue's /auth/v1/verify
// which returns the session via #access_token in the URL hash — a path the
// /auth/callback route doesn't handle (it expects ?code= from a PKCE flow).
// The /signin page's verifyEmailLink server action extracts the token_hash
// from the link text and calls supabase.auth.verifyOtp directly, which sets
// the session cookie server-side. Tested working with Playwright 1.60.
async function signInAs(page: Parameters<Parameters<typeof test>[1]>[0]["page"], email: string): Promise<void> {
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "http://localhost:3000/auth/callback" },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(`generateLink failed: ${error?.message ?? "no link"}`);
  }

  await page.goto(`/signin?sent=${encodeURIComponent(email)}`);
  await page.getByText("Email doesn't show a code? Paste the link instead.").click();
  await page.locator('textarea[name="link"]').fill(data.properties.action_link);
  await page.getByRole("button", { name: "Verify from link" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/app"));
}

test.describe("cross-tenant URL guessing", () => {
  test.skip(
    !env.SUPABASE_SERVICE_ROLE_KEY,
    "needs a populated .env.local (run npx supabase start + scripts/setup-roles.sh)",
  );

  test("eve (bigco owner, not in acme) cannot access /app/acme", async ({ page }) => {
    // Eve is bigco owner per the fixture (01_fixture.sql) and has no acme
    // membership. /app/acme should 404 because getWorkspaceBySlug calls
    // notFound() when the member-join returns no rows.
    await signInAs(page, "eve@example.test");
    const response = await page.goto("/app/acme");
    expect(response?.status()).toBe(404);
  });

  test("eve sees only her workspaces on /app", async ({ page }) => {
    await signInAs(page, "eve@example.test");
    await page.goto("/app");
    // Eve is in bigco only. acme/holdings/solo-co should not appear.
    await expect(page.getByText("BigCo Inc")).toBeVisible();
    await expect(page.getByText("Acme Corp")).not.toBeVisible();
    await expect(page.getByText("Holdings Group")).not.toBeVisible();
  });
});
