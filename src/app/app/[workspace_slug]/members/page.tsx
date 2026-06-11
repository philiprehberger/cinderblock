import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";

type MemberRow = {
  role: "owner" | "admin" | "member" | "guest";
  joined_at: string;
  user_id: string;
};

export default async function MembersPage(props: {
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await props.params;
  const workspace = await getWorkspaceBySlug(workspace_slug);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, joined_at")
    .eq("workspace_id", workspace.id)
    .is("removed_at", null)
    .order("joined_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        Could not load members: {error.message}
      </div>
    );
  }

  const members = (data ?? []) as MemberRow[];

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Members</h2>
      {workspace.role === "guest" || workspace.role === "member" ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          You see only your own row. Owners and admins see the full list.
        </p>
      ) : null}
      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <div className="font-medium">{m.user_id}</div>
              <div className="text-xs text-zinc-500">
                Joined {new Date(m.joined_at).toLocaleDateString()}
              </div>
            </div>
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
