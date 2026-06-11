import Link from "next/link";

import { listMyWorkspaces } from "@/lib/workspaces/queries";

export default async function AppHome() {
  const workspaces = await listMyWorkspaces();

  if (workspaces.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold">No workspaces yet</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Create your first workspace to get started.
        </p>
        <Link
          href="/app/new"
          className="mt-6 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create workspace
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your workspaces</h1>
        <Link
          href="/app/new"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          New workspace
        </Link>
      </div>

      <ul className="mt-6 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {workspaces.map((ws) => (
          <li key={ws.id} className="px-4 py-3">
            <Link
              href={`/app/${ws.slug}`}
              className="flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{ws.name}</div>
                <div className="text-sm text-zinc-500">/{ws.slug}</div>
              </div>
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {ws.role}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
