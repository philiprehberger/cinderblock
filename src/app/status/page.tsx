import Link from "next/link";

export const dynamic = "force-dynamic";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // Supabase API reachable
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      checks.push({
        name: "Supabase URL configured",
        ok: false,
        detail: "NEXT_PUBLIC_SUPABASE_URL is unset",
      });
    } else {
      const res = await fetch(`${url}/auth/v1/settings`, {
        next: { revalidate: 60 },
      });
      // /auth/v1/settings requires an apikey; we deliberately don't send
      // one. A reachable Auth server returns 200 (some configurations) or
      // 401 (most); both prove the service is up. Only 5xx / network
      // failures count as down.
      const reachable = res.status === 200 || res.status === 401;
      checks.push({
        name: "Supabase Auth reachable",
        ok: reachable,
        detail: `HTTP ${res.status}${res.status === 401 ? " (expected — no apikey sent)" : ""}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "Supabase Auth reachable",
      ok: false,
      detail: `fetch error: ${String(err)}`,
    });
  }

  // Stripe configuration
  checks.push({
    name: "Stripe configured",
    ok: Boolean(process.env.STRIPE_SECRET_KEY),
    detail: process.env.STRIPE_SECRET_KEY
      ? "STRIPE_SECRET_KEY is set"
      : "STRIPE_SECRET_KEY is unset — billing UI runs in demo mode",
  });

  // Audit writer connection
  checks.push({
    name: "Audit writer URL configured",
    ok: Boolean(process.env.PG_AUDIT_WRITER_URL),
    detail: process.env.PG_AUDIT_WRITER_URL
      ? "PG_AUDIT_WRITER_URL is set"
      : "PG_AUDIT_WRITER_URL is unset — auditLog() will throw",
  });

  // JWT signing
  checks.push({
    name: "Impersonation JWT secret configured",
    ok: Boolean(process.env.SUPABASE_JWT_SECRET),
    detail: process.env.SUPABASE_JWT_SECRET
      ? "SUPABASE_JWT_SECRET is set"
      : "SUPABASE_JWT_SECRET is unset — impersonation will fail",
  });

  return checks;
}

export default async function StatusPage() {
  const checks = await runChecks();
  const allGood = checks.every((c) => c.ok);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Cinderblock
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Status</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Live runtime checks. {allGood ? "All systems nominal." : "Some checks are red — see below."}
        </p>

        <ul className="mt-8 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {checks.map((c) => (
            <li
              key={c.name}
              className="flex items-baseline justify-between px-4 py-3"
            >
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-zinc-500">{c.detail}</div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                  c.ok
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {c.ok ? "ok" : "fail"}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
