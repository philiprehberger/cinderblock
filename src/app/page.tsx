import Link from "next/link";
import { redirect } from "next/navigation";

// Supabase Auth strips the callback path when the redirect_to isn't matched
// by the project's Redirect URLs allow-list — in practice that lands the
// OAuth code at `/?code=...` instead of `/auth/callback?code=...`. We
// forward it through here so the flow survives any Supabase wildcard
// quirks. Same handling for `?error=`.
export default async function Home(props: {
  searchParams?: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  if (sp.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(sp.code)}`);
  }
  if (sp.error) {
    redirect(
      `/signin?error=${encodeURIComponent(sp.error_description ?? sp.error)}`,
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="text-lg font-semibold tracking-tight">Cinderblock</div>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/docs/security/rls"
            className="text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
          >
            How RLS works
          </Link>
          <Link
            href="/signin"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          The multi-tenant Supabase starter whose Row-Level-Security suite
          survives hostile fixtures.
        </h1>
        <p className="mt-6 text-lg leading-7 text-zinc-700 dark:text-zinc-300">
          Most Supabase multi-tenant deliveries trust the client to send the
          right tenant ID, use the service-role key to bypass RLS "for
          performance," or write policies that pass against the owner's own
          data and silently leak under joins. Cinderblock doesn't.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signin"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Try the demo
          </Link>
          <a
            href="https://github.com/philiprehberger/cinderblock"
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Use this template
          </a>
        </div>

        <section className="mt-20">
          <h2 className="text-xl font-semibold">What's in the box</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
            <li>Workspace + member + role data model</li>
            <li>74 pgtap policy tests against a 5×8 hostile fixture</li>
            <li>Magic-link auth + TOTP MFA for owners</li>
            <li>Admin impersonation with 60-min server-minted JWT</li>
            <li>Append-only audit log via a single-purpose Postgres role</li>
            <li>Insert-first Stripe webhook idempotency</li>
          </ul>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-10 text-xs text-zinc-500">
        Cinderblock is a portfolio demonstration. See{" "}
        <Link href="/about" className="underline">
          /about
        </Link>{" "}
        for honest framing.
      </footer>
    </div>
  );
}
