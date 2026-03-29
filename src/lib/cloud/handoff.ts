import type { SupabaseClient } from "@supabase/supabase-js";

export type CloudIncomingHandoffRequest = {
  id: number;
  workspaceId: string;
  campaignId: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  message: string | null;
  expiresAt: string;
  createdAt: string;
  fromEmail: string | null;
  fromDisplayName: string | null;
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

export async function requestCampaignHandoff(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string,
  toUserId: string,
  message?: string
): Promise<void> {
  const { error } = await supabase.rpc("create_editor_handoff_request", {
    p_workspace_id: workspaceId,
    p_campaign_id: campaignId,
    p_to_user_id: toUserId,
    p_message: message ?? null,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to send handoff request.")
    );
  }
}

export async function listIncomingCampaignHandoffRequests(
  supabase: SupabaseClient,
  workspaceId: string,
  campaignId: string
): Promise<CloudIncomingHandoffRequest[]> {
  const { data, error } = await supabase.rpc("list_incoming_editor_handoff_requests", {
    p_workspace_id: workspaceId,
    p_campaign_id: campaignId,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to load handoff requests.")
    );
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      const idRaw = row.id;
      const id =
        typeof idRaw === "number"
          ? idRaw
          : typeof idRaw === "string"
            ? Number(idRaw)
            : NaN;
      return {
        id,
        workspaceId:
          typeof row.workspace_id === "string" ? row.workspace_id : "",
        campaignId:
          typeof row.campaign_id === "string" ? row.campaign_id : "",
        fromUserId:
          typeof row.from_user_id === "string" ? row.from_user_id : "",
        toUserId:
          typeof row.to_user_id === "string" ? row.to_user_id : "",
        status:
          row.status === "accepted" ||
          row.status === "declined" ||
          row.status === "cancelled" ||
          row.status === "expired"
            ? row.status
            : "pending",
        message: typeof row.message === "string" ? row.message : null,
        expiresAt:
          typeof row.expires_at === "string"
            ? row.expires_at
            : new Date().toISOString(),
        createdAt:
          typeof row.created_at === "string"
            ? row.created_at
            : new Date().toISOString(),
        fromEmail:
          typeof row.from_email === "string" ? row.from_email : null,
        fromDisplayName:
          typeof row.from_display_name === "string" ? row.from_display_name : null,
      };
    })
    .filter((row) => Number.isFinite(row.id) && row.workspaceId && row.campaignId);
}

export async function respondCampaignHandoffRequest(
  supabase: SupabaseClient,
  requestId: number,
  action: "accepted" | "declined" | "cancelled"
): Promise<void> {
  const { error } = await supabase.rpc("respond_editor_handoff_request", {
    p_request_id: requestId,
    p_action: action,
  });
  if (error) {
    throw new Error(
      normalizeSupabaseErrorMessage(error, "Unable to respond to handoff request.")
    );
  }
}
