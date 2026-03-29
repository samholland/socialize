import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { readBearerToken, userCanAccessWorkspace } from "@/lib/supabase/access";

type CreatePayload = {
  workspaceId?: string;
  clientId?: string;
  projectId?: string;
  expiresInDays?: number;
};

type RevokePayload = {
  workspaceId?: string;
  projectId?: string;
};

function normalizeApiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return fallback;
}

function normalizePresentationLinkError(error: unknown, fallback: string): string {
  const message = normalizeApiError(error, fallback);
  const lower = message.toLowerCase();
  if (lower.includes("presentation_share_links")) {
    return "Presentation link migration is missing. Run the latest Supabase migrations.";
  }
  return message;
}

function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

function addDaysIso(days: number): string {
  const clampedDays = Math.max(1, Math.min(365, Math.round(days)));
  const ms = clampedDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function isIsoExpired(value: string | null): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed <= Date.now();
}

function shareUrlForToken(req: Request, token: string): string {
  const origin = new URL(req.url).origin;
  return `${origin}/p/${encodeURIComponent(token)}`;
}

export async function POST(req: Request) {
  try {
    const bearer = readBearerToken(req);
    if (!bearer) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const body = (await req.json()) as CreatePayload;
    const workspaceId = body.workspaceId?.trim();
    const clientId = body.clientId?.trim();
    const projectId = body.projectId?.trim();
    const expiresAt = addDaysIso(
      typeof body.expiresInDays === "number" ? body.expiresInDays : 30
    );
    if (!workspaceId || !projectId) {
      return NextResponse.json(
        { error: "workspaceId and projectId are required" },
        { status: 400 }
      );
    }

    const admin = getServiceSupabaseClient();
    const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canAccess = await userCanAccessWorkspace(admin, userData.user.id, workspaceId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: project, error: projectErr } = await admin
      .from("projects")
      .select("id,client_id")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle();
    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (clientId && project.client_id !== clientId) {
      return NextResponse.json({ error: "Project/client mismatch" }, { status: 400 });
    }

    const { data: existingRows, error: existingErr } = await admin
      .from("presentation_share_links")
      .select("id,token,expires_at")
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingErr) {
      return NextResponse.json(
        { error: normalizePresentationLinkError(existingErr, "Failed to load existing links.") },
        { status: 500 }
      );
    }

    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing && !isIsoExpired(existing.expires_at ?? null)) {
      return NextResponse.json({
        ok: true,
        token: existing.token,
        url: shareUrlForToken(req, existing.token),
        reused: true,
      });
    }

    const nextToken = generateShareToken();
    if (existing?.id) {
      const { error: updateErr } = await admin
        .from("presentation_share_links")
        .update({
          token: nextToken,
          created_by: userData.user.id,
          expires_at: expiresAt,
          revoked_at: null,
        })
        .eq("id", existing.id);
      if (updateErr) {
        return NextResponse.json(
          {
            error: normalizePresentationLinkError(
              updateErr,
              "Failed to update presentation link."
            ),
          },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        token: nextToken,
        url: shareUrlForToken(req, nextToken),
        reused: false,
      });
    }

    const { error: insertErr } = await admin.from("presentation_share_links").insert({
      token: nextToken,
      workspace_id: workspaceId,
      project_id: projectId,
      created_by: userData.user.id,
      expires_at: expiresAt,
    });
    if (insertErr) {
      return NextResponse.json(
        {
          error: normalizePresentationLinkError(
            insertErr,
            "Failed to create presentation link."
          ),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      token: nextToken,
      url: shareUrlForToken(req, nextToken),
      reused: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: normalizePresentationLinkError(error, "Unable to create presentation link.") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const bearer = readBearerToken(req);
    if (!bearer) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const body = (await req.json()) as RevokePayload;
    const workspaceId = body.workspaceId?.trim();
    const projectId = body.projectId?.trim();
    if (!workspaceId || !projectId) {
      return NextResponse.json(
        { error: "workspaceId and projectId are required" },
        { status: 400 }
      );
    }

    const admin = getServiceSupabaseClient();
    const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canAccess = await userCanAccessWorkspace(admin, userData.user.id, workspaceId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin
      .from("presentation_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId)
      .is("revoked_at", null);
    if (error) {
      return NextResponse.json(
        { error: normalizePresentationLinkError(error, "Unable to revoke link.") },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: normalizePresentationLinkError(error, "Unable to revoke link.") },
      { status: 500 }
    );
  }
}
