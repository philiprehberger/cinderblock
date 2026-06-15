import { expect, test } from "@playwright/test";

// The minimum smoke: unauthenticated journeys land where we expect.
// Drives the assertion that the marketing page renders, the signin page
// renders, and any /app/* hit redirects to /signin when not authenticated.

test("marketing landing renders the headline + signin CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /multi-tenant Supabase starter/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("signin page renders the email form", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send sign-in code/i })).toBeVisible();
});

test("/app redirects to /signin when not authenticated", async ({ page }) => {
  const response = await page.goto("/app");
  expect(response?.url()).toMatch(/\/signin/);
});

test("/app/[any-slug]/audit redirects to /signin when not authenticated", async ({ page }) => {
  const response = await page.goto("/app/foo/audit");
  expect(response?.url()).toMatch(/\/signin/);
});

test("/app/[any-slug]/billing redirects to /signin when not authenticated", async ({ page }) => {
  const response = await page.goto("/app/foo/billing");
  expect(response?.url()).toMatch(/\/signin/);
});
