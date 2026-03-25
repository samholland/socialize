import { NextResponse } from "next/server";
import { SUPABASE_MEDIA_BUCKET } from "@/lib/supabase/env";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { readBearerToken, userCanAccessWorkspace } from "@/lib/supabase/access";

type Payload = {
  workspaceId?: string;
  campaignId?: string;
  fileName?: string;
  contentType?: string;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const body = (await req.json()) as Payload;
    const workspaceId = body.workspaceId?.trim();
    const campaignId = body.campaignId?.trim();
    const fileName = safeFileName(body.fileName?.trim() || "upload.bin");
    const contentType = body.contentType?.trim() || "application/octet-stream";
    if (!workspaceId || !campaignId) {
      return NextResponse.json({ error: "workspaceId and campaignId are required" }, { status: 400 });
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
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignErr || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
    const objectPath = `${workspaceId}/${campaignId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    const { data, error } = await admin.storage
      .from(SUPABASE_MEDIA_BUCKET)
      .createSignedUploadUrl(objectPath, { upsert: false });
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to create signed upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      path: objectPath,
      token: data.token,
      contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
