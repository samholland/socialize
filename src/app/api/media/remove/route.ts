import { NextResponse } from "next/server";
import { SUPABASE_MEDIA_BUCKET } from "@/lib/supabase/env";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { readBearerToken, userCanAccessWorkspace } from "@/lib/supabase/access";

type Payload = {
  workspaceId?: string;
  campaignId?: string;
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
    if (!workspaceId || !campaignId) {
      return NextResponse.json({ error: "workspaceId and campaignId are required" }, { status: 400 });
    }

    const admin = getServiceSupabaseClient();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canAccess = await userCanAccessWorkspace(admin, userData.user.id, workspaceId);
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

    const { error: deactivateErr } = await admin
      .from("media_assets")
      .update({ is_active: false })
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId);
    if (deactivateErr) {
      return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
    }

    const { error: campaignUpdateErr } = await admin
      .from("campaigns")
      .update({
        media_storage_path: null,
        media_kind: "none",
        media_mime_type: null,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", campaignId);
    if (campaignUpdateErr) {
      return NextResponse.json({ error: campaignUpdateErr.message }, { status: 500 });
    }

    if (campaign.media_storage_path) {
      await admin.storage
        .from(SUPABASE_MEDIA_BUCKET)
        .remove([campaign.media_storage_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
