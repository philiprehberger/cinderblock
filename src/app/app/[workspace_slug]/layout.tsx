import Link from "next/link";

import { getWorkspaceBySlug } from "@/lib/workspaces/queries";

export default async function WorkspaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await props.params;
  const workspace = await getWorkspaceBySlug(workspace_slug);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {workspace.name}
          </h1>
          <div className="text-sm text-zinc-500">/{workspace.slug}</div>
        </div>
        <Link href="/app" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← All workspaces
        </Link>
      </div>

      <nav className="mb-6 flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800">
        <Link
          href={`/app/${workspace.slug}`}
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Tasks
        </Link>
        <Link
          href={`/app/${workspace.slug}/members`}
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Members
        </Link>
        <Link
          href={`/app/${workspace.slug}/audit`}
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Audit log
        </Link>
        {workspace.role === "owner" ? (
          <Link
            href={`/app/${workspace.slug}/billing`}
            className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Billing
          </Link>
        ) : null}
      </nav>

      {props.children}
    </div>
  );
}
