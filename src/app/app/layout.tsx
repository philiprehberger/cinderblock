import Link from "next/link";

import { requireAuth } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
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
