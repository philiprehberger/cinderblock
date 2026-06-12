import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { listPendingInvitations } from "@/lib/invitations/queries";
import { inviteMember, revokeInvitation } from "@/lib/invitations/actions";
import { changeMemberRole, removeMember } from "@/lib/members/actions";
import { getUserEmails } from "@/lib/users/queries";

type MemberRow = {
  role: "owner" | "admin" | "member" | "guest";
  joined_at: string;
  user_id: string;
};

const ERROR_LABELS: Record<string, string> = {
  invalid_email: "That email doesn't look valid.",
  invalid_role: "Pick a valid role.",
  not_admin: "Only admins and owners can do that.",
  already_member: "That email is already a member of this workspace.",
  already_invited: "That email already has a pending invitation.",
  not_a_member: "Inviter isn't a member of this workspace.",
  invalid_signature: "Edge function rejected the request signature. Check EDGE_INTERNAL_SECRET.",
  cannot_change_self: "You can't change your own role from this page.",
  cannot_remove_self: "You can't remove yourself.",
  owner_role_requires_owner: "Only owners can promote to or demote from owner.",
  target_not_member: "That member is no longer active in this workspace.",
  last_owner_cannot_demote: "This workspace must always have at least one owner.",
  last_owner_cannot_remove: "This workspace must always have at least one owner.",
};

const ASSIGNABLE_ROLES: Array<"owner" | "admin" | "member" | "guest"> = [
  "owner",
  "admin",
  "member",
  "guest",
];

export default async function MembersPage(props: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{
    error?: string;
    invited?: string;
    revoked?: string;
    changed?: string;
    removed?: string;
  }>;
}) {
  const { workspace_slug } = await props.params;
  const { error, invited, revoked, changed, removed } = await props.searchParams;
  const workspace = await getWorkspaceBySlug(workspace_slug);
  const currentUser = await getCurrentUser();
  const canManage = workspace.role === "owner" || workspace.role === "admin";
  const canPromoteOwner = workspace.role === "owner";

  const supabase = await createClient();
  const { data: membersData, error: membersError } = await supabase
    .from("workspace_members")
    .select("user_id, role, joined_at")
    .eq("workspace_id", workspace.id)
    .is("removed_at", null)
    .order("joined_at", { ascending: true });

  const members = (membersData ?? []) as MemberRow[];
  const emails = await getUserEmails(members.map((m) => m.user_id));

  const pending = canManage ? await listPendingInvitations(workspace.id) : [];

  return (
    <div className="space-y-8">
      {/* ------------------- alerts ------------------- */}
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {ERROR_LABELS[error] ?? error}
        </div>
      ) : null}
      {invited ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Invitation sent. In local dev, the email lands in{" "}
          <a className="underline" href="http://127.0.0.1:54324">Mailpit</a>.
        </div>
      ) : null}
      {revoked ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Invitation revoked.
        </div>
      ) : null}
      {changed ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Role updated.
        </div>
      ) : null}
      {removed ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Member removed.
        </div>
      ) : null}

      {/* ------------------- invite form (admin+) ------------------- */}
      {canManage ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold">Invite a member</h2>
          <form action={inviteMember} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_120px]">
            <input type="hidden" name="workspace_slug" value={workspace.slug} />
            <input
              type="email"
              name="email"
              required
              placeholder="teammate@example.com"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            />
            <select
              name="role"
              defaultValue="member"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="guest">Guest</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Send invite
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            Owner promotions happen through role change below, not invite.
          </p>
        </section>
      ) : null}

      {/* ------------------- pending invitations (admin+) ------------------- */}
      {canManage && pending.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">Pending invitations</h2>
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{inv.email}</div>
                  <div className="text-xs text-zinc-500">
                    Expires {new Date(inv.expires_at).toLocaleDateString()} ·{" "}
                    <span className="uppercase tracking-wide">{inv.role}</span>
                  </div>
                </div>
                <form action={revokeInvitation}>
                  <input type="hidden" name="workspace_slug" value={workspace.slug} />
                  <input type="hidden" name="invitation_id" value={inv.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------- members ------------------- */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Members</h2>
        {workspace.role === "guest" || workspace.role === "member" ? (
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            You see only your own row. Owners and admins see the full list.
          </p>
        ) : null}
        {membersError ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Could not load members: {membersError.message}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {members.map((m) => {
              const isSelf = currentUser?.id === m.user_id;
              const displayEmail = emails.get(m.user_id) ?? m.user_id;
              const canEditThisRow =
                canManage &&
                !isSelf &&
                (m.role !== "owner" || canPromoteOwner);
              return (
                <li
                  key={m.user_id}
                  className="grid items-center gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <div className="font-medium">
                      {displayEmail}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-zinc-500">(you)</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Joined {new Date(m.joined_at).toLocaleDateString()}
                    </div>
                  </div>

                  {canEditThisRow ? (
                    <form action={changeMemberRole} className="flex items-center gap-2">
                      <input type="hidden" name="workspace_slug" value={workspace.slug} />
                      <input type="hidden" name="target_user_id" value={m.user_id} />
                      <select
                        name="new_role"
                        defaultValue={m.role}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {ASSIGNABLE_ROLES.map((r) => {
                          const ownerNeedsOwner = r === "owner" && !canPromoteOwner;
                          return (
                            <option key={r} value={r} disabled={ownerNeedsOwner}>
                              {r}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {m.role}
                    </span>
                  )}

                  {canEditThisRow ? (
                    <form action={removeMember}>
                      <input type="hidden" name="workspace_slug" value={workspace.slug} />
                      <input type="hidden" name="target_user_id" value={m.user_id} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Remove
                      </button>
                    </form>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
