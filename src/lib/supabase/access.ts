import type { SupabaseClient } from "@supabase/supabase-js";

export async function userCanAccessWorkspace(
  admin: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data: workspace, error: wsErr } = await admin
    .from("workspaces")
    .select("id,owner_user_id,organization_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (wsErr || !workspace) return false;
  if (workspace.owner_user_id === userId) return true;
  if (!workspace.organization_id) return false;

  const { data: membership, error: memErr } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("organization_id", workspace.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(!memErr && membership);
}

export function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}
