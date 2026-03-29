import { SUPABASE_MEDIA_BUCKET } from "@/lib/supabase/env";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import type { PublicPresentationDocument } from "@/lib/presentation/types";

function normalizeMediaAspect(value: unknown): "1:1" | "3:4" | "9:16" {
  if (value === "3:4" || value === "9:16") return value;
  return "1:1";
}

function normalizeStatus(value: unknown): "draft" | "ready" | "approved" {
  if (value === "ready" || value === "approved") return value;
  return "draft";
}

function normalizeMediaKind(
  value: unknown,
  mimeType: string | null
): "none" | "image" | "video" {
  if (value === "image" || value === "video" || value === "none") {
    return value;
  }
  if (typeof mimeType === "string") {
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("image/")) return "image";
  }
  return "none";
}

function stableSeedFromText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isExpired(expiresAt: unknown): boolean {
  const parsed = parseIsoDate(expiresAt);
  if (parsed === null) return false;
  return parsed <= Date.now();
}

export async function loadPublicPresentationByToken(
  token: string
): Promise<PublicPresentationDocument | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) return null;

  let admin: ReturnType<typeof getServiceSupabaseClient>;
  try {
    admin = getServiceSupabaseClient();
  } catch {
    return null;
  }

  const { data: linkRow, error: linkError } = await admin
    .from("presentation_share_links")
    .select("token,workspace_id,project_id,expires_at,revoked_at")
    .eq("token", normalizedToken)
    .maybeSingle();
  if (linkError || !linkRow) return null;
  if (linkRow.revoked_at) return null;
  if (isExpired(linkRow.expires_at)) return null;

  const workspaceId = typeof linkRow.workspace_id === "string" ? linkRow.workspace_id : "";
  const projectId = typeof linkRow.project_id === "string" ? linkRow.project_id : "";
  if (!workspaceId || !projectId) return null;

  const [{ data: workspaceRow }, { data: projectRow }] = await Promise.all([
    admin
      .from("workspaces")
      .select("id,name")
      .eq("id", workspaceId)
      .maybeSingle(),
    admin
      .from("projects")
      .select("id,client_id,name")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  if (!workspaceRow || !projectRow) return null;
  const clientId = typeof projectRow.client_id === "string" ? projectRow.client_id : "";
  if (!clientId) return null;

  const [{ data: clientRow }, { data: campaignRows }] = await Promise.all([
    admin
      .from("clients")
      .select("id,name,is_verified,profile_image_data_url")
      .eq("workspace_id", workspaceId)
      .eq("id", clientId)
      .maybeSingle(),
    admin
      .from("campaigns")
      .select(
        "id,name,platform,media_aspect,primary_text,facebook_page_name,headline,url,cta,cta_visible,cta_bg_color,cta_text_color,status,updated_at,media_storage_path,media_kind,media_mime_type"
      )
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (!clientRow) return null;
  const campaigns = campaignRows ?? [];

  const mediaPaths = Array.from(
    new Set(
      campaigns
        .map((campaign) =>
          typeof campaign.media_storage_path === "string" ? campaign.media_storage_path : ""
        )
        .filter(Boolean)
    )
  );

  const signedUrlMap = new Map<string, string>();
  if (mediaPaths.length > 0) {
    const { data: signedRows, error: signedErr } = await admin.storage
      .from(SUPABASE_MEDIA_BUCKET)
      .createSignedUrls(mediaPaths, 60 * 60);
    if (!signedErr && signedRows) {
      signedRows.forEach((row, index) => {
        const path = mediaPaths[index];
        if (path && row.signedUrl) {
          signedUrlMap.set(path, row.signedUrl);
        }
      });
    }
  }

  return {
    token: normalizedToken,
    workspaceId,
    workspaceName: typeof workspaceRow.name === "string" ? workspaceRow.name : "Workspace",
    projectId,
    projectName: typeof projectRow.name === "string" ? projectRow.name : "Project",
    clientId,
    clientName: typeof clientRow.name === "string" ? clientRow.name : "Client",
    clientVerified: clientRow.is_verified === true,
    clientAvatarUrl:
      typeof clientRow.profile_image_data_url === "string"
        ? clientRow.profile_image_data_url
        : null,
    expiresAt: typeof linkRow.expires_at === "string" ? linkRow.expires_at : null,
    campaigns: campaigns.map((campaign) => {
      const mimeType =
        typeof campaign.media_mime_type === "string" ? campaign.media_mime_type : null;
      const mediaKind = normalizeMediaKind(campaign.media_kind, mimeType);
      const storagePath =
        typeof campaign.media_storage_path === "string" ? campaign.media_storage_path : null;
      const signedUrl = storagePath ? signedUrlMap.get(storagePath) ?? null : null;
      const media =
        mediaKind === "none" || !signedUrl
          ? {
              kind: "none" as const,
              url: null,
              storagePath,
              mimeType,
            }
          : {
              kind: mediaKind,
              url: signedUrl,
              storagePath,
              mimeType,
            };

      return {
        id: campaign.id,
        name: campaign.name ?? "Ad",
        platform: campaign.platform ?? "Instagram Feed",
        mediaAspect: normalizeMediaAspect(campaign.media_aspect),
        primaryText: campaign.primary_text ?? "",
        facebookPageName: campaign.facebook_page_name ?? "",
        headline: campaign.headline ?? "",
        url: campaign.url ?? "",
        cta: campaign.cta ?? "Learn More",
        ctaVisible: campaign.cta_visible !== false,
        ctaBgColor: campaign.cta_bg_color ?? "#f2f2f2",
        ctaTextColor: campaign.cta_text_color ?? "#111111",
        status: normalizeStatus(campaign.status),
        updatedAt:
          typeof campaign.updated_at === "string"
            ? campaign.updated_at
            : new Date().toISOString(),
        media,
        engagementSeed: stableSeedFromText(`${workspaceId}|${campaign.id}`),
      };
    }),
  };
}
