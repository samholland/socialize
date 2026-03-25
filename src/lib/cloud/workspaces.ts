import type { SupabaseClient, User } from "@supabase/supabase-js";

export type CloudWorkspace = {
  id: string;
  name: string;
  kind: "personal" | "organization";
};

export type CloudCampaign = {
  id: string;
  name: string;
  platform: string;
  mediaAspect: "1:1" | "3:4" | "9:16";
  primaryText: string;
  facebookPageName: string;
  headline: string;
  url: string;
  cta: string;
  ctaVisible: boolean;
  audienceProfile: string;
  messagePillar: string;
  ctaBgColor: string;
  ctaTextColor: string;
  status: "draft" | "ready";
  updatedAt: string;
  mediaStoragePath?: string;
  mediaKind?: "none" | "image" | "video";
  mediaMimeType?: string;
};

export type CloudProject = {
  id: string;
  name: string;
  objective: string;
  primaryGoal: string;
  defaultCta: string;
  audienceProfiles: string[];
  messagePillars: string[];
  guardrails: string;
  campaigns: CloudCampaign[];
};

export type CloudClient = {
  id: string;
  name: string;
  isVerified: boolean;
  profileImageDataUrl?: string;
  projects: CloudProject[];
};

export type CloudAppData = { clients: CloudClient[] };

export async function ensureProfileAndPersonalWorkspace(
  supabase: SupabaseClient,
  user: User
): Promise<CloudWorkspace> {
  await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? "",
    },
    { onConflict: "user_id" }
  );

  const { data: existingPersonal, error: personalErr } = await supabase
    .from("workspaces")
    .select("id,name,type")
    .eq("type", "personal")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (personalErr) throw personalErr;
  if (existingPersonal) {
    return {
      id: existingPersonal.id,
      name: existingPersonal.name,
      kind: "personal",
    };
  }

  const workspaceId = `ws_${crypto.randomUUID().slice(0, 8)}`;
  const workspaceName = "My Workspace";
  const { error: createErr } = await supabase.from("workspaces").insert({
    id: workspaceId,
    type: "personal",
    owner_user_id: user.id,
    name: workspaceName,
  });
  if (createErr) throw createErr;

  return {
    id: workspaceId,
    name: workspaceName,
    kind: "personal",
  };
}

export async function listAccessibleWorkspaces(
  supabase: SupabaseClient,
  userId: string
): Promise<CloudWorkspace[]> {
  const { data: personalRows, error: personalErr } = await supabase
    .from("workspaces")
    .select("id,name,type")
    .eq("type", "personal")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true });
  if (personalErr) throw personalErr;

  const { data: memberships, error: membershipErr } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId);
  if (membershipErr) throw membershipErr;

  const orgIds = Array.from(new Set((memberships ?? []).map((m) => m.organization_id).filter(Boolean)));
  let orgRows: Array<{ id: string; name: string; type: string }> = [];
  if (orgIds.length > 0) {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id,name,type")
      .eq("type", "organization")
      .in("organization_id", orgIds)
      .order("created_at", { ascending: true });
    if (error) throw error;
    orgRows = data ?? [];
  }

  return [
    ...(personalRows ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      kind: "personal" as const,
    })),
    ...orgRows.map((w) => ({
      id: w.id,
      name: w.name,
      kind: "organization" as const,
    })),
  ];
}

export async function loadWorkspaceData(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CloudAppData> {
  const [clientsRes, projectsRes, campaignsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id,name,is_verified,profile_image_data_url")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select("id,client_id,name,objective,primary_goal,default_cta,audience_profiles,message_pillars,guardrails")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("campaigns")
      .select(
        "id,project_id,name,platform,media_aspect,primary_text,facebook_page_name,headline,url,cta,cta_visible,audience_profile,message_pillar,cta_bg_color,cta_text_color,status,updated_at,media_storage_path,media_kind,media_mime_type"
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (campaignsRes.error) throw campaignsRes.error;

  const projectsByClient = new Map<string, CloudProject[]>();
  for (const p of projectsRes.data ?? []) {
    const list = projectsByClient.get(p.client_id) ?? [];
    list.push({
      id: p.id,
      name: p.name,
      objective: p.objective ?? "Awareness",
      primaryGoal: p.primary_goal ?? "",
      defaultCta: p.default_cta ?? "Learn More",
      audienceProfiles: Array.isArray(p.audience_profiles) ? p.audience_profiles : [],
      messagePillars: Array.isArray(p.message_pillars) ? p.message_pillars : [],
      guardrails: p.guardrails ?? "",
      campaigns: [],
    });
    projectsByClient.set(p.client_id, list);
  }

  const campaignsByProject = new Map<string, CloudCampaign[]>();
  for (const c of campaignsRes.data ?? []) {
    const list = campaignsByProject.get(c.project_id) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      platform: c.platform,
      mediaAspect: c.media_aspect,
      primaryText: c.primary_text ?? "",
      facebookPageName: c.facebook_page_name ?? "",
      headline: c.headline ?? "",
      url: c.url ?? "",
      cta: c.cta ?? "Learn More",
      ctaVisible: c.cta_visible ?? true,
      audienceProfile: c.audience_profile ?? "",
      messagePillar: c.message_pillar ?? "",
      ctaBgColor: c.cta_bg_color ?? "#f2f2f2",
      ctaTextColor: c.cta_text_color ?? "#111111",
      status: c.status === "ready" ? "ready" : "draft",
      updatedAt: c.updated_at ?? new Date().toISOString(),
      mediaStoragePath: c.media_storage_path ?? undefined,
      mediaKind:
        c.media_kind === "image" || c.media_kind === "video"
          ? c.media_kind
          : "none",
      mediaMimeType: c.media_mime_type ?? undefined,
    });
    campaignsByProject.set(c.project_id, list);
  }

  for (const [clientId, projects] of projectsByClient.entries()) {
    projectsByClient.set(
      clientId,
      projects.map((p) => ({
        ...p,
        campaigns: campaignsByProject.get(p.id) ?? [],
      }))
    );
  }

  const clients: CloudClient[] = (clientsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    isVerified: c.is_verified ?? false,
    profileImageDataUrl: c.profile_image_data_url ?? undefined,
    projects: projectsByClient.get(c.id) ?? [],
  }));

  return { clients };
}

async function deleteStaleRows(
  supabase: SupabaseClient,
  table: "clients" | "projects" | "campaigns",
  workspaceId: string,
  keepIds: string[]
) {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const stale = (data ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.includes(id));
  if (stale.length === 0) return;
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("workspace_id", workspaceId)
    .in("id", stale);
  if (delErr) throw delErr;
}

export async function saveWorkspaceData(
  supabase: SupabaseClient,
  workspaceId: string,
  data: CloudAppData,
  userId: string
) {
  const clients = data.clients ?? [];
  const projects = clients.flatMap((c) => c.projects.map((p) => ({ ...p, clientId: c.id })));
  const campaigns = projects.flatMap((p) => p.campaigns.map((c) => ({ ...c, projectId: p.id })));

  const clientRows = clients.map((c) => ({
    workspace_id: workspaceId,
    id: c.id,
    name: c.name,
    is_verified: c.isVerified,
    profile_image_data_url: c.profileImageDataUrl ?? null,
    updated_at: new Date().toISOString(),
  }));

  const projectRows = projects.map((p) => ({
    workspace_id: workspaceId,
    id: p.id,
    client_id: p.clientId,
    name: p.name,
    objective: p.objective,
    primary_goal: p.primaryGoal ?? "",
    default_cta: p.defaultCta ?? "Learn More",
    audience_profiles: p.audienceProfiles ?? [],
    message_pillars: p.messagePillars ?? [],
    guardrails: p.guardrails ?? "",
    updated_at: new Date().toISOString(),
  }));

  const campaignRows = campaigns.map((c) => ({
    workspace_id: workspaceId,
    id: c.id,
    project_id: c.projectId,
    name: c.name,
    platform: c.platform,
    media_aspect: c.mediaAspect,
    primary_text: c.primaryText ?? "",
    facebook_page_name: c.facebookPageName ?? "",
    headline: c.headline ?? "",
    url: c.url ?? "",
    cta: c.cta ?? "Learn More",
    cta_visible: c.ctaVisible ?? true,
    audience_profile: c.audienceProfile ?? "",
    message_pillar: c.messagePillar ?? "",
    cta_bg_color: c.ctaBgColor ?? "#f2f2f2",
    cta_text_color: c.ctaTextColor ?? "#111111",
    status: c.status === "ready" ? "ready" : "draft",
    updated_at: c.updatedAt ?? new Date().toISOString(),
    media_storage_path: c.mediaStoragePath ?? null,
    media_kind: c.mediaKind ?? "none",
    media_mime_type: c.mediaMimeType ?? null,
  }));

  if (clientRows.length > 0) {
    const { error } = await supabase
      .from("clients")
      .upsert(clientRows, { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  if (projectRows.length > 0) {
    const { error } = await supabase
      .from("projects")
      .upsert(projectRows, { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  if (campaignRows.length > 0) {
    const { error } = await supabase
      .from("campaigns")
      .upsert(campaignRows, { onConflict: "workspace_id,id" });
    if (error) throw error;
  }

  await deleteStaleRows(
    supabase,
    "campaigns",
    workspaceId,
    campaigns.map((c) => c.id)
  );
  await deleteStaleRows(
    supabase,
    "projects",
    workspaceId,
    projects.map((p) => p.id)
  );
  await deleteStaleRows(
    supabase,
    "clients",
    workspaceId,
    clients.map((c) => c.id)
  );

  const activeMedia = campaigns
    .filter((c) => c.mediaStoragePath && c.mediaKind && c.mediaKind !== "none")
    .map((c) => ({
      workspace_id: workspaceId,
      campaign_id: c.id,
      storage_path: c.mediaStoragePath as string,
      media_kind: c.mediaKind as "image" | "video",
      mime_type: c.mediaMimeType ?? null,
      size_bytes: null,
      created_by: userId,
      is_active: true,
    }));

  const { error: deactivateErr } = await supabase
    .from("media_assets")
    .update({ is_active: false })
    .eq("workspace_id", workspaceId);
  if (deactivateErr) throw deactivateErr;

  if (activeMedia.length > 0) {
    const { error } = await supabase
      .from("media_assets")
      .upsert(activeMedia, { onConflict: "storage_path" });
    if (error) throw error;
  }
}
