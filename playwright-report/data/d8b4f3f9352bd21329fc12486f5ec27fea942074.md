# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-routes.spec.ts >> /app/[any-slug]/billing redirects to /signin when not authenticated
- Location: e2e/public-routes.spec.ts:30:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/app/foo/billing", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | // The minimum smoke: unauthenticated journeys land where we expect.
  4  | // Drives the assertion that the marketing page renders, the signin page
  5  | // renders, and any /app/* hit redirects to /signin when not authenticated.
  6  | 
  7  | test("marketing landing renders the headline + signin CTA", async ({ page }) => {
  8  |   await page.goto("/");
  9  |   await expect(page.getByRole("heading", { name: /multi-tenant Supabase starter/i })).toBeVisible();
  10 |   await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  11 | });
  12 | 
  13 | test("signin page renders the email form", async ({ page }) => {
  14 |   await page.goto("/signin");
  15 |   await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  16 |   await expect(page.getByLabel("Email")).toBeVisible();
  17 |   await expect(page.getByRole("button", { name: /Send sign-in code/i })).toBeVisible();
  18 | });
  19 | 
  20 | test("/app redirects to /signin when not authenticated", async ({ page }) => {
  21 |   const response = await page.goto("/app");
  22 |   expect(response?.url()).toMatch(/\/signin/);
  23 | });
  24 | 
  25 | test("/app/[any-slug]/audit redirects to /signin when not authenticated", async ({ page }) => {
  26 |   const response = await page.goto("/app/foo/audit");
  27 |   expect(response?.url()).toMatch(/\/signin/);
  28 | });
  29 | 
  30 | test("/app/[any-slug]/billing redirects to /signin when not authenticated", async ({ page }) => {
> 31 |   const response = await page.goto("/app/foo/billing");
     |                               ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  32 |   expect(response?.url()).toMatch(/\/signin/);
  33 | });
  34 | 
```