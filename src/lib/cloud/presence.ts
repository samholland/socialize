import type { SupabaseClient } from "@supabase/supabase-js";

export type CloudEditorPresence = {
  userId: string;
  email: string | null;
  expiresAt: string;
  isSelf: boolean;
};

function normalizeSupabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim().length > 0) {
      return `${fallback} (${code})`;
    }
  }
  return fallback;
}

export async function upsertCampaignEditorPresence(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string,
  ttlSeconds = 45
): Promise<void> {
  const { error } = await supabase.rpc("upsert_editor_presence", {
    p_workspace_id: workspaceId,
    p_entity_type: "campaign",
    p_entity_id: campaignId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to refresh editor presence.")
    );
  }
}

export async function clearCampaignEditorPresence(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string
): Promise<void> {
  const { error } = await supabase.rpc("clear_editor_presence", {
    p_workspace_id: workspaceId,
    p_entity_type: "campaign",
    p_entity_id: campaignId,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to clear editor presence.")
    );
  }
}

export async function listCampaignEditorPresence(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string
): Promise<CloudEditorPresence[]> {
  const { data, error } = await supabase.rpc("list_editor_presence", {
    p_workspace_id: workspaceId,
    p_entity_type: "campaign",
    p_entity_id: campaignId,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to load editor presence.")
    );
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => ({
      userId: typeof row.user_id === "string" ? row.user_id : "",
      email: typeof row.email === "string" ? row.email : null,
      expiresAt:
        typeof row.expires_at === "string" ? row.expires_at : new Date().toISOString(),
      isSelf: row.is_self === true,
    }))
    .filter((row) => Boolean(row.userId));
}
