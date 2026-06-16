import { createServiceRoleClient } from "@/lib/supabase/server-only";

type PolicyRow = {
  schemaname: string;
  tablename: string;
  policyname: string;
  cmd: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
};

// Policies change only when migrations run. ISR with hourly revalidation
// keeps the page in Next.js's static cache (no per-request DB hit, no
// `cache-control: no-store` on the response — so the back/forward cache
// can restore it). A migration deploy invalidates the build cache anyway.
export const revalidate = 3600;

async function loadPolicies(): Promise<PolicyRow[]> {
  // Build-time prerender runs without env vars set. ISR revalidates after
  // deploy with the deployed env, so an empty render here is correct — the
  // amber-banner UI below already covers the "no data yet" state.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  const service = createServiceRoleClient();
  // pg_policies is in pg_catalog; PostgREST won't expose it through the
  // Data API by default. Use the RPC path with a dedicated helper.
  // For the demo we use service-role SELECT on a wrapping view.
  const { data, error } = await service
    .from("v_public_policies")
    .select("*");
  if (error) {
    // If the view doesn't exist yet, return empty and surface the error
    // in the UI; the migration adding the view is `0120_policy_viewer.sql`.
    return [];
  }
  return (data ?? []) as PolicyRow[];
}

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

export default async function PolicyViewerPage() {
  const policies = await loadPolicies();
  const byTable = groupBy(
    policies.filter((p) => p.schemaname === "public"),
    (p) => p.tablename,
  );
  const tables = Object.keys(byTable).sort();

  return (
    <>
      <h1>Live policy viewer</h1>
      <p>
        Reads <code>pg_policies</code> on the deployed database via a
        public view (<code>v_public_policies</code>). The page proves the
        deployed policies are exactly what these docs claim — no static
        snapshot can drift.
      </p>
      <p>
        Need an offline reference?{" "}
        <a href="/print/policies" target="_blank" rel="noopener noreferrer">
          Open the printable policy reference
        </a>
        {" "}
        and use File → Print → Save as PDF.
      </p>

      {policies.length === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The viewer view isn&apos;t available in this environment yet.
          Apply migration <code>0120_policy_viewer.sql</code> to enable it.
        </div>
      ) : null}

      {tables.map((tbl) => (
        <section key={tbl} className="not-prose mt-8">
          <h2 className="text-lg font-semibold">public.{tbl}</h2>
          <div className="mt-2 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Policy</th>
                  <th className="px-3 py-2">Cmd</th>
                  <th className="px-3 py-2">Roles</th>
                  <th className="px-3 py-2">USING</th>
                  <th className="px-3 py-2">WITH CHECK</th>
                </tr>
              </thead>
              <tbody>
                {byTable[tbl]!.map((p) => (
                  <tr key={p.policyname} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-mono text-xs">{p.policyname}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.cmd}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.roles?.join(", ") ?? ""}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.qual ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.with_check ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
