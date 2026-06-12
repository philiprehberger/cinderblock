import Link from "next/link";

import { PLANS } from "@/lib/stripe/catalog";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Cinderblock
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/docs" className="hover:underline">Docs</Link>
            <Link href="/pricing" className="hover:underline">Pricing</Link>
            <Link href="/signin" className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Cinderblock is test-mode-only on the demo. Plans are real — billing
          is not. A forker switches in their own Stripe keys to enable real
          checkout.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {(["free", "team", "business"] as const).map((id) => {
            const plan = PLANS[id];
            return (
              <div
                key={id}
                className="rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="text-base font-semibold">{plan.name}</div>
                <div className="mt-2 text-3xl font-semibold">
                  ${plan.monthlyPriceUsd}
                  <span className="text-base text-zinc-500">/mo</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {plan.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          See <Link href="/docs/billing/stripe" className="underline">Stripe wiring</Link>{" "}
          for how Checkout, the Customer Portal, and the insert-first
          webhook idempotency are wired.
        </p>
      </main>
    </div>
  );
}
