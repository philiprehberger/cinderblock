import Link from "next/link";

export default function AboutPage() {
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
          </nav>
        </div>
      </header>

      <main className="prose prose-zinc mx-auto max-w-3xl px-6 py-16 dark:prose-invert">
        <h1>About this demo</h1>

        <p>
          <strong>
            This is a portfolio demonstration. Do not use it for
            production data.
          </strong>
        </p>

        <p>
          Cinderblock is a forkable Supabase + Next.js multi-tenant SaaS
          starter built by{" "}
          <a href="https://philiprehberger.com">Philip Rehberger</a> as a
          calling card for Supabase work. The pitch in one line:{" "}
          <em>
            most Supabase multi-tenant deliveries leak; this one has tests
            that prove it doesn&apos;t.
          </em>
        </p>

        <h2>What this demo is</h2>
        <ul>
          <li>
            A live, signed-up-able SaaS surface so you can click around
            and feel the tenant boundary hold.
          </li>
          <li>
            A pgtap suite (74 tests) you can clone and run locally —
            green output in under a second once Postgres is warm.
          </li>
          <li>
            A forkable repo. If you want to use this as the skeleton for
            your own Supabase SaaS, click &quot;Use this template&quot; on{" "}
            <a href="https://github.com/philiprehberger/cinderblock">GitHub</a>.
          </li>
        </ul>

        <h2>What this demo is not</h2>
        <ul>
          <li>
            A product. The Tasks surface is foreground — the security
            boundary is the actual deliverable.
          </li>
          <li>
            A security audit. See{" "}
            <Link href="/docs/security/disclaimer">Disclaimer</Link> for
            the specific framing the test suite makes.
          </li>
          <li>
            SOC2-attested. See{" "}
            <Link href="/docs/compliance">Compliance posture</Link> for
            what an engagement-level deliverable would add.
          </li>
        </ul>

        <h2>Cost framing</h2>
        <p>
          The demo runs on Supabase Cloud (Pro plan, $25/mo) with
          auto-pause disabled. If traffic spikes, the project overages
          into paid — it doesn&apos;t pause. A paused demo means a
          prospect&apos;s sign-up flow breaks, which destroys the pitch.
        </p>

        <h2>Hire me</h2>
        <p>
          If you&apos;re reading this because you&apos;ve seen a Supabase
          RLS leak in production, or you&apos;re converting a single-tenant
          app to multi-tenant and don&apos;t want to leak,{" "}
          <a href="https://scopeforged.com/contact">get in touch</a>. The
          shape of work this demo sells:
        </p>
        <ul>
          <li>Supabase + Next.js multi-tenant SaaS builds ($8k–25k)</li>
          <li>Single-to-multi-tenant conversions ($15k–40k)</li>
          <li>RLS audits — fixed-fee for the audit, hourly for fixes ($3k–8k)</li>
        </ul>
      </main>
    </div>
  );
}
