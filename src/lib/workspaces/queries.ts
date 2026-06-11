import "server-only";

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  created_by: string;
  billing_email: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type WorkspaceWithRole = Workspace & {
  role: "owner" | "admin" | "member" | "guest";
};

// Lists the current user's active workspaces with their role. Joins through
// workspace_members on the user_id index — RLS lets the caller read only
// their own membership rows, so the join naturally scopes to "my workspaces."
export async function listMyWorkspaces(): Promise<WorkspaceWithRole[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select(
      `
      role,
      workspaces!inner(
        id, slug, name, created_by, billing_email, deleted_at, created_at
      )
    `,
    )
    .is("removed_at", null)
    .is("workspaces.deleted_at", null)
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error(`listMyWorkspaces failed: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const ws = row.workspaces as unknown as Workspace;
    return {
      ...ws,
      role: row.role as WorkspaceWithRole["role"],
    };
  });
}

// Resolves a slug to a workspace, verifies the caller is an active member,
// 404s otherwise. The membership check happens server-side via RLS — if the
// caller isn't a member, the SELECT returns no row and notFound() fires.
export async function getWorkspaceBySlug(slug: string): Promise<WorkspaceWithRole> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspaces")
    .select(
      `
      id, slug, name, created_by, billing_email, deleted_at, created_at,
      workspace_members!inner(role)
    `,
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    notFound();
  }

  // workspace_members!inner produces a one-element array because of the join.
  const role = (
    data.workspace_members as unknown as Array<{ role: WorkspaceWithRole["role"] }>
  )[0]?.role;

  if (!role) {
    notFound();
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    created_by: data.created_by,
    billing_email: data.billing_email,
    deleted_at: data.deleted_at,
    created_at: data.created_at,
    role,
  };
}
