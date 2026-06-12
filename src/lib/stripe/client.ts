import "server-only";

import Stripe from "stripe";

// Lazy Stripe client. Returns null when STRIPE_SECRET_KEY is unset so the
// rest of the codebase can render a "Stripe not configured" path instead
// of crashing at import time. The portfolio demo runs without Stripe wired
// up by default (no test keys committed); a forker adds STRIPE_SECRET_KEY
// and STRIPE_PRICE_TEAM / STRIPE_PRICE_BUSINESS to enable the flow.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // No explicit apiVersion: the Stripe SDK's pinned LatestApiVersion type
  // only accepts the current SDK release's literal; the SDK default tracks
  // it automatically. Bumping the API version = bumping the SDK package,
  // which is the auditable surface.
  _stripe = new Stripe(key, { typescript: true });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
