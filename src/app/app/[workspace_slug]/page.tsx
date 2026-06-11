import { getWorkspaceBySlug } from "@/lib/workspaces/queries";

export default async function WorkspaceHome(props: {
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await props.params;
  const workspace = await getWorkspaceBySlug(workspace_slug);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Tasks</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        The Tasks surface ships in a follow-on commit. For now, this workspace
        is a placeholder — the load-bearing part is that you got here and the
        members tab respects the role gate.
      </p>
      <div className="mt-4 text-xs text-zinc-500">
        Workspace id: <code>{workspace.id}</code>
      </div>
    </div>
  );
}
