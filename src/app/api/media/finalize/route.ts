import { NextResponse } from "next/server";
import { SUPABASE_MEDIA_BUCKET } from "@/lib/supabase/env";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { readBearerToken, userCanAccessWorkspace } from "@/lib/supabase/access";

type Payload = {
  workspaceId?: string;
  campaignId?: string;
  path?: string;
  mediaKind?: "image" | "video";
  mimeType?: string;
  sizeBytes?: number;
};

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const body = (await req.json()) as Payload;
    const workspaceId = body.workspaceId?.trim();
    const campaignId = body.campaignId?.trim();
    const path = body.path?.trim();
    const mediaKind = body.mediaKind;
    const mimeType = body.mimeType?.trim() || null;
    const sizeBytes = typeof body.sizeBytes === "number" ? Math.max(0, Math.round(body.sizeBytes)) : null;
    if (!workspaceId || !campaignId || !path || (mediaKind !== "image" && mediaKind !== "video")) {
      return NextResponse.json(
        { error: "workspaceId, campaignId, path and mediaKind are required" },
        { status: 400 }
      );
    }
    if (!path.startsWith(`${workspaceId}/${campaignId}/`)) {
      return NextResponse.json({ error: "Invalid media path for campaign" }, { status: 403 });
    }

    const admin = getServiceSupabaseClient();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userData.user.id;

    const canAccess = await userCanAccessWorkspace(admin, userId, workspaceId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: campaign, error: campaignErr } = await admin
      .from("campaigns")
      .select("id,media_storage_path")
      .eq("workspace_id", workspaceId)
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignErr || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { error: deactivateErr } = await admin
      .from("media_assets")
      .update({ is_active: false })
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId);
    if (deactivateErr) {
      return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
    }

    const { error: mediaErr } = await admin
      .from("media_assets")
      .upsert(
        {
          workspace_id: workspaceId,
          campaign_id: campaignId,
          storage_path: path,
          media_kind: mediaKind,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          created_by: userId,
          is_active: true,
        },
        { onConflict: "storage_path" }
      );
    if (mediaErr) {
      return NextResponse.json({ error: mediaErr.message }, { status: 500 });
    }

    const { error: campaignUpdateErr } = await admin
      .from("campaigns")
      .update({
        media_storage_path: path,
        media_kind: mediaKind,
        media_mime_type: mimeType,
        updated_at: now,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", campaignId);
    if (campaignUpdateErr) {
      return NextResponse.json({ error: campaignUpdateErr.message }, { status: 500 });
    }

    const previousPath = campaign.media_storage_path;
    if (previousPath && previousPath !== path) {
      await admin.storage.from(SUPABASE_MEDIA_BUCKET).remove([previousPath]);
    }

    return NextResponse.json({ ok: true, path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
