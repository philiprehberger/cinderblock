import Link from "next/link";

import { requireAuth } from "@/lib/auth/session";
import { getImpersonationClaims } from "@/lib/supabase/server";
import { getUserEmails } from "@/lib/users/queries";
import { endImpersonation } from "@/lib/impersonation/actions";

function fmtTimeLeft(exp: number): string {
  const seconds = Math.max(0, exp - Math.floor(Date.now() / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const impClaims = await getImpersonationClaims();

  // When impersonation is active, `user` (from requireAuth) is the
  // *impersonated* user (because requireAuth reads through the same
  // impersonation-aware createClient). impClaims.impersonatedBy is the admin.
  // Resolve both emails for the banner.
  const idsToLookup: string[] = impClaims
    ? [impClaims.sub, impClaims.impersonatedBy]
    : [];
  const emails = idsToLookup.length
    ? await getUserEmails(idsToLookup)
    : new Map<string, string>();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {impClaims ? (
        <div className="border-b border-red-600 bg-red-600 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm">
            <div>
              <strong>Impersonating</strong>{" "}
              {emails.get(impClaims.sub) ?? impClaims.sub}{" "}
              <span className="opacity-80">
                as {emails.get(impClaims.impersonatedBy) ?? impClaims.impersonatedBy}
              </span>{" "}
              · session expires in{" "}
              <span className="font-mono">{fmtTimeLeft(impClaims.exp)}</span>
            </div>
            <form action={endImpersonation}>
              <button
                type="submit"
                className="rounded-md border border-white px-3 py-1 text-xs font-medium hover:bg-white hover:text-red-700"
              >
                End impersonation
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/app" className="text-lg font-semibold tracking-tight">
            Cinderblock
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-zinc-600 dark:text-zinc-400 sm:inline">
              {user.email}
            </span>
            <form action="/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
