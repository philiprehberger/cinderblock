import Link from "next/link";

const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: "Start",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/getting-started", label: "Getting started" },
      { href: "/docs/concepts/multi-tenancy", label: "Multi-tenancy concepts" },
    ],
  },
  {
    group: "Security",
    items: [
      { href: "/docs/security/rls", label: "Row-Level Security" },
      { href: "/docs/security/policies", label: "Live policy viewer" },
      { href: "/docs/security/test-results", label: "Test results" },
      { href: "/docs/security/audit-log", label: "Audit log + impersonation" },
      { href: "/docs/security/policy-cost", label: "Policy evaluation cost" },
      { href: "/docs/security/cookie-scope", label: "Cookie scope" },
      { href: "/docs/security/mfa", label: "MFA + step-up" },
      { href: "/docs/security/disclaimer", label: "Disclaimer" },
    ],
  },
  {
    group: "Extensions",
    items: [
      { href: "/docs/security/extensions", label: "Overview" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/docs/billing/stripe", label: "Stripe wiring" },
      { href: "/docs/self-hosting", label: "Self-hosting" },
      { href: "/docs/compliance", label: "Compliance posture" },
      { href: "/docs/swap-vercel", label: "Swap to Vercel" },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Cinderblock
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/docs" className="hover:underline">
              Docs
            </Link>
            <Link href="/pricing" className="hover:underline">
              Pricing
            </Link>
            <Link href="/signin" className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-[220px_1fr]">
        <aside className="text-sm">
          {NAV.map((group) => (
            <div key={group.group} className="mb-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {group.group}
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-zinc-700 hover:text-zinc-950 hover:underline dark:text-zinc-300 dark:hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <main className="prose prose-zinc max-w-none dark:prose-invert prose-pre:bg-zinc-100 prose-pre:text-zinc-900 dark:prose-pre:bg-zinc-900 dark:prose-pre:text-zinc-100 prose-code:font-mono">
          {children}
        </main>
      </div>
    </div>
  );
}
