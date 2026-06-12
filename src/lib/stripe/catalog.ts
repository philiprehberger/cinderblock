// The Cinderblock plan catalog. Pure data — no runtime dependencies — so it
// imports cleanly from server components, client components, and the Edge
// Function webhook. The Stripe price IDs are set as env vars on the
// production deployment; in dev they're undefined and the UI surfaces a
// "Stripe not configured" message instead of crashing.

export type PlanId = "free" | "team" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  seats: number;
  monthlyPriceUsd: number;
  features: string[];
  // The Stripe Price ID env var that points to this tier in test mode.
  // The catalog keeps the var NAMES, not the values — values land in
  // process.env so they aren't committed.
  stripePriceEnvVar?: "STRIPE_PRICE_TEAM" | "STRIPE_PRICE_BUSINESS";
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    seats: 3,
    monthlyPriceUsd: 0,
    features: [
      "1 workspace",
      "3 members",
      "30-day audit retention",
      "Magic-link sign-in",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    seats: 10,
    monthlyPriceUsd: 29,
    features: [
      "Up to 10 members",
      "90-day audit retention",
      "Admin impersonation with full audit trail",
      "Google OAuth + TOTP MFA",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_TEAM",
  },
  business: {
    id: "business",
    name: "Business",
    seats: 50,
    monthlyPriceUsd: 99,
    features: [
      "Unlimited members",
      "Forever audit retention",
      "All Team features",
      "Custom SSO + SCIM (engagement-only)",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_BUSINESS",
  },
};

export const PAID_PLANS: PlanId[] = ["team", "business"];

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function stripePriceForPlan(id: PlanId): string | null {
  const plan = PLANS[id];
  if (!plan.stripePriceEnvVar) return null;
  return process.env[plan.stripePriceEnvVar] ?? null;
}
