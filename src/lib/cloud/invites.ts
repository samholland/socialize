import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeSupabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim().length > 0) return `${fallback} (${code})`;
  }
  return fallback;
}

export type CloudWorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: "owner" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string;
  invitedByEmail: string | null;
  createdAt: string;
  expiresAt: string;
};

export type CloudIncomingWorkspaceInvite = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
  role: "owner" | "member";
  invitedBy: string;
  invitedByEmail: string | null;
  createdAt: string;
  expiresAt: string;
};

function normalizeInviteRole(value: unknown): "owner" | "member" {
  return value === "owner" ? "owner" : "member";
}

function normalizeInviteStatus(
  value: unknown
): "pending" | "accepted" | "revoked" | "expired" {
  if (value === "accepted" || value === "revoked" || value === "expired") return value;
  return "pending";
}

export async function listWorkspaceInvites(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CloudWorkspaceInvite[]> {
  const { data, error } = await supabase.rpc("list_workspace_invites", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to load workspace invites.")
    );
  }
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : "",
      email: typeof row.email === "string" ? row.email : "",
      role: normalizeInviteRole(row.role),
      status: normalizeInviteStatus(row.status),
      invitedBy: typeof row.invited_by === "string" ? row.invited_by : "",
      invitedByEmail: typeof row.invited_by_email === "string" ? row.invited_by_email : null,
      createdAt:
        typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      expiresAt:
        typeof row.expires_at === "string" ? row.expires_at : new Date().toISOString(),
    }))
    .filter((row) => Boolean(row.id && row.workspaceId && row.email));
}

export async function createWorkspaceInvite(
  supabase: SupabaseClient,
  workspaceId: string,
  email: string,
  role: "owner" | "member"
): Promise<CloudWorkspaceInvite> {
  const { data, error } = await supabase.rpc("create_workspace_invite", {
    p_workspace_id: workspaceId,
    p_email: email,
    p_role: role,
    p_expires_days: 30,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to create workspace invite.")
    );
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.id !== "string") {
    throw new Error("Failed to create workspace invite.");
  }
  return {
    id: row.id,
    workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : workspaceId,
    email: typeof row.email === "string" ? row.email : email,
    role: normalizeInviteRole(row.role),
    status: normalizeInviteStatus(row.status),
    invitedBy: "",
    invitedByEmail: null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : new Date().toISOString(),
  };
}

export async function revokeWorkspaceInvite(
  supabase: SupabaseClient,
  inviteId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_workspace_invite", {
    p_invite_id: inviteId,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to revoke workspace invite.")
    );
  }
  return data === true;
}

export async function listMyPendingWorkspaceInvites(
  supabase: SupabaseClient
): Promise<CloudIncomingWorkspaceInvite[]> {
  const { data, error } = await supabase.rpc("list_my_pending_workspace_invites");
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to load incoming invites.")
    );
  }
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : "",
      workspaceName:
        typeof row.workspace_name === "string" ? row.workspace_name : "Shared Workspace",
      organizationId: typeof row.organization_id === "string" ? row.organization_id : "",
      organizationName:
        typeof row.organization_name === "string" ? row.organization_name : "",
      role: normalizeInviteRole(row.role),
      invitedBy: typeof row.invited_by === "string" ? row.invited_by : "",
      invitedByEmail: typeof row.invited_by_email === "string" ? row.invited_by_email : null,
      createdAt:
        typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      expiresAt:
        typeof row.expires_at === "string" ? row.expires_at : new Date().toISOString(),
    }))
    .filter((row) => Boolean(row.id && row.workspaceId));
}

export async function acceptWorkspaceInvite(
  supabase: SupabaseClient,
  inviteId: string
): Promise<{ workspaceId: string; organizationId: string; role: "owner" | "member" }> {
  const { data, error } = await supabase.rpc("accept_workspace_invite", {
    p_invite_id: inviteId,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to accept workspace invite.")
    );
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.workspace_id !== "string" || typeof row.organization_id !== "string") {
    throw new Error("Failed to accept invite.");
  }
  return {
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    role: normalizeInviteRole(row.role),
  };
}
