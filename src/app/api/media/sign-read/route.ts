import { NextResponse } from "next/server";
import { SUPABASE_MEDIA_BUCKET } from "@/lib/supabase/env";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { readBearerToken, userCanAccessWorkspace } from "@/lib/supabase/access";

type Payload = {
  workspaceId?: string;
  paths?: string[];
};

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }
    const body = (await req.json()) as Payload;
    const workspaceId = body.workspaceId?.trim();
    const paths = (body.paths ?? []).map((p) => p.trim()).filter(Boolean);
    if (!workspaceId || paths.length === 0) {
      return NextResponse.json({ error: "workspaceId and paths are required" }, { status: 400 });
    }
    const pathPrefix = `${workspaceId}/`;
    const allInWorkspace = paths.every((path) => path.startsWith(pathPrefix));
    if (!allInWorkspace) {
      return NextResponse.json({ error: "One or more paths are outside this workspace" }, { status: 403 });
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

    const { data, error } = await admin.storage
      .from(SUPABASE_MEDIA_BUCKET)
      .createSignedUrls(paths, 60 * 10);
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Unable to sign URLs" }, { status: 500 });
    }

    const urls = data.reduce<Record<string, string>>((acc, row, index) => {
      if (row.signedUrl) acc[paths[index]] = row.signedUrl;
      return acc;
    }, {});
    return NextResponse.json({ urls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
