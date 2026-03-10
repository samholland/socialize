"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PreviewCanvas, type PreviewMedia } from "@/components/PreviewCanvas";

type Platform =
  | "Instagram Feed"
  | "Instagram Story"
  | "Facebook Feed"
  | "LinkedIn Feed"
  | "TikTok";

type CtaOption = "Learn More" | "Shop Now" | "Sign Up" | "Download";
type MediaAspect = "1:1" | "3:4" | "9:16";
type CampaignObjective = "Awareness" | "Consideration" | "Conversion";

type Campaign = {
  id: string;
  name: string;
  platform: Platform;
  mediaAspect: MediaAspect;
  primaryText: string;
  cta: CtaOption;
  audienceProfile: string;
  messagePillar: string;
  ctaBgColor: string;
  ctaTextColor: string;
  updatedAt: string;
};

type Project = {
  id: string;
  name: string;
  objective: CampaignObjective;
  primaryGoal: string;
  defaultCta: CtaOption;
  audienceProfiles: string[];
  messagePillars: string[];
  guardrails: string;
  campaigns: Campaign[];
};

type Client = {
  id: string;
  name: string;
  profileImageDataUrl?: string;
  projects: Project[];
};

type AppData = {
  clients: Client[];
};

type Selection = {
  clientId: string;
  projectId: string;
  campaignId: string;
};

type EditingName =
  | { kind: "client"; clientId: string; value: string }
  | { kind: "project"; clientId: string; projectId: string; value: string }
  | {
      kind: "campaign";
      clientId: string;
      projectId: string;
      campaignId: string;
      value: string;
    };

type EditorMode = "campaign" | "campaign-settings" | "client";

const STORAGE_KEY = "socialize.v1.workspace";

const PLATFORM_OPTIONS: Platform[] = [
  "Instagram Feed",
  "Instagram Story",
  "Facebook Feed",
  "LinkedIn Feed",
  "TikTok",
];

const CTA_OPTIONS: CtaOption[] = ["Learn More", "Shop Now", "Sign Up", "Download"];
const CAMPAIGN_OBJECTIVE_OPTIONS: CampaignObjective[] = [
  "Awareness",
  "Consideration",
  "Conversion",
];
const FEED_ASPECT_OPTIONS: MediaAspect[] = ["1:1", "3:4"];
const EMPTY_PREVIEW_MEDIA: PreviewMedia = { kind: "none" };
const DEFAULT_CTA_BG_COLOR = "#4f94aa";
const DEFAULT_CTA_TEXT_COLOR = "#ffffff";

const SHELL_FALLBACK_STYLE = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "300px minmax(380px, 1fr) minmax(440px, 560px)",
} as const;

const SIDEBAR_FALLBACK_STYLE = {
  borderRight: "1px solid #d9dde3",
} as const;

const EDITOR_FALLBACK_STYLE = {
  borderRight: "1px solid #d9dde3",
} as const;

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isStoryLikePlatform(platform: Platform): boolean {
  return platform === "Instagram Story" || platform === "TikTok";
}

function normalizeAspectForPlatform(
  platform: Platform,
  aspect: MediaAspect | string | undefined
): MediaAspect {
  if (isStoryLikePlatform(platform)) return "9:16";
  if (aspect === "3:4") return "3:4";
  return "1:1";
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

function normalizeObjective(value: unknown): CampaignObjective {
  if (value === "Consideration" || value === "Conversion") {
    return value;
  }
  return "Awareness";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(values: string[]): string {
  return values.join("\n");
}

function newCampaign(
  name: string,
  options?: { defaultCta?: CtaOption; audienceProfile?: string; messagePillar?: string }
): Campaign {
  return {
    id: newId("cmp"),
    name,
    platform: "Instagram Feed",
    mediaAspect: "1:1",
    primaryText: "",
    cta: options?.defaultCta ?? "Learn More",
    audienceProfile: options?.audienceProfile ?? "",
    messagePillar: options?.messagePillar ?? "",
    ctaBgColor: DEFAULT_CTA_BG_COLOR,
    ctaTextColor: DEFAULT_CTA_TEXT_COLOR,
    updatedAt: nowIso(),
  };
}

function newProject(name: string, campaigns: Campaign[]): Project {
  return {
    id: newId("prj"),
    name,
    objective: "Awareness",
    primaryGoal: "",
    defaultCta: "Learn More",
    audienceProfiles: [],
    messagePillars: [],
    guardrails: "",
    campaigns,
  };
}

function normalizeData(data: AppData): AppData {
  return {
    clients: data.clients.map((client) => ({
      ...client,
      profileImageDataUrl:
        typeof client.profileImageDataUrl === "string"
          ? client.profileImageDataUrl
          : undefined,
      projects: client.projects.map((project) => ({
        ...project,
        objective: normalizeObjective((project as { objective?: unknown }).objective),
        primaryGoal:
          typeof (project as { primaryGoal?: unknown }).primaryGoal === "string"
            ? (project as { primaryGoal?: string }).primaryGoal ?? ""
            : "",
        defaultCta:
          (project as { defaultCta?: CtaOption }).defaultCta &&
          CTA_OPTIONS.includes((project as { defaultCta?: CtaOption }).defaultCta as CtaOption)
            ? ((project as { defaultCta?: CtaOption }).defaultCta as CtaOption)
            : "Learn More",
        audienceProfiles: normalizeStringList(
          (project as { audienceProfiles?: unknown }).audienceProfiles
        ),
        messagePillars: normalizeStringList(
          (project as { messagePillars?: unknown }).messagePillars
        ),
        guardrails:
          typeof (project as { guardrails?: unknown }).guardrails === "string"
            ? (project as { guardrails?: string }).guardrails ?? ""
            : "",
        campaigns: project.campaigns.map((campaign) => ({
          ...campaign,
          mediaAspect: normalizeAspectForPlatform(
            campaign.platform,
            (campaign as { mediaAspect?: MediaAspect }).mediaAspect
          ),
          audienceProfile:
            typeof (campaign as { audienceProfile?: unknown }).audienceProfile === "string"
              ? (campaign as { audienceProfile?: string }).audienceProfile ?? ""
              : "",
          messagePillar:
            typeof (campaign as { messagePillar?: unknown }).messagePillar === "string"
              ? (campaign as { messagePillar?: string }).messagePillar ?? ""
              : "",
          ctaBgColor: normalizeHexColor(
            (campaign as { ctaBgColor?: string }).ctaBgColor,
            DEFAULT_CTA_BG_COLOR
          ),
          ctaTextColor: normalizeHexColor(
            (campaign as { ctaTextColor?: string }).ctaTextColor,
            DEFAULT_CTA_TEXT_COLOR
          ),
        })),
      })),
    })),
  };
}

function seedData(): AppData {
  return {
    clients: [
      {
        id: newId("cl"),
        name: "Client One",
        projects: [
          newProject("Project One", [newCampaign("Ad One"), newCampaign("Ad Two")]),
          newProject("Project Two", [newCampaign("Ad Three")]),
        ],
      },
      {
        id: newId("cl"),
        name: "Client Two",
        projects: [
          newProject("Spring Launch", [newCampaign("Ad One")]),
        ],
      },
    ],
  };
}

function defaultSelection(data: AppData): Selection {
  const client = data.clients[0];
  const project = client?.projects[0];
  const campaign = project?.campaigns[0];

  return {
    clientId: client?.id ?? "",
    projectId: project?.id ?? "",
    campaignId: campaign?.id ?? "",
  };
}

const INITIAL_DATA = seedData();
const INITIAL_SELECTION = defaultSelection(INITIAL_DATA);

function getSelectedContext(data: AppData, selection: Selection) {
  const client = data.clients.find((item) => item.id === selection.clientId);
  const project = client?.projects.find((item) => item.id === selection.projectId);
  const campaign = project?.campaigns.find((item) => item.id === selection.campaignId);

  return { client, project, campaign };
}

function resolveSelection(data: AppData, selection: Selection | undefined): Selection {
  if (!selection) return defaultSelection(data);
  const context = getSelectedContext(data, selection);
  if (context.client && context.project && context.campaign) return selection;
  return defaultSelection(data);
}

function loadWorkspace(): { data: AppData; selection: Selection } {
  if (typeof window === "undefined") {
    return { data: INITIAL_DATA, selection: INITIAL_SELECTION };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { data: INITIAL_DATA, selection: INITIAL_SELECTION };
    }

    const parsed = JSON.parse(raw) as { data?: AppData; selection?: Selection };
    if (!parsed?.data?.clients?.length) {
      return { data: INITIAL_DATA, selection: INITIAL_SELECTION };
    }

    const normalizedData = normalizeData(parsed.data);

    return {
      data: normalizedData,
      selection: resolveSelection(normalizedData, parsed.selection),
    };
  } catch {
    return { data: INITIAL_DATA, selection: INITIAL_SELECTION };
  }
}

function formatCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ");
  if (!/[",]/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, header: string[], row: string[]) {
  const csvText = [header.join(","), row.map(formatCsvCell).join(",")].join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read image file"));
    };
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const initialWorkspace = useMemo(() => loadWorkspace(), []);
  const [data, setData] = useState<AppData>(initialWorkspace.data);
  const [selection, setSelection] = useState<Selection>(initialWorkspace.selection);
  const [editorMode, setEditorMode] = useState<EditorMode>("campaign");
  const [editingName, setEditingName] = useState<EditingName | null>(null);
  const [campaignSettingsDraftByProjectId, setCampaignSettingsDraftByProjectId] = useState<
    Record<string, { audienceProfilesText: string; messagePillarsText: string }>
  >({});
  const [campaignMediaById, setCampaignMediaById] = useState<
    Record<string, PreviewMedia>
  >({});
  const campaignMediaRef = useRef<Record<string, PreviewMedia>>({});

  useEffect(() => {
    const payload = JSON.stringify({ data, selection });
    localStorage.setItem(STORAGE_KEY, payload);
  }, [data, selection]);

  useEffect(() => {
    campaignMediaRef.current = campaignMediaById;
  }, [campaignMediaById]);

  useEffect(() => {
    return () => {
      for (const media of Object.values(campaignMediaRef.current)) {
        if (media.kind !== "none") {
          URL.revokeObjectURL(media.url);
        }
      }
    };
  }, []);

  const selected = useMemo(() => getSelectedContext(data, selection), [data, selection]);
  const selectedClient = selected.client;
  const selectedProject = selected.project;
  const selectedCampaign = selected.campaign;
  const selectedCampaignMedia =
    campaignMediaById[selection.campaignId] ?? EMPTY_PREVIEW_MEDIA;
  const audienceProfileOptions = useMemo(
    () => normalizeStringList(selectedProject?.audienceProfiles),
    [selectedProject?.audienceProfiles]
  );
  const messagePillarOptions = useMemo(
    () => normalizeStringList(selectedProject?.messagePillars),
    [selectedProject?.messagePillars]
  );
  const selectedProjectDraft = selectedProject
    ? campaignSettingsDraftByProjectId[selectedProject.id]
    : undefined;
  const audienceProfilesDraft =
    selectedProjectDraft?.audienceProfilesText ?? listToLines(selectedProject?.audienceProfiles ?? []);
  const messagePillarsDraft =
    selectedProjectDraft?.messagePillarsText ?? listToLines(selectedProject?.messagePillars ?? []);

  function setCampaignMedia(campaignId: string, media: PreviewMedia) {
    setCampaignMediaById((prev) => {
      const current = prev[campaignId];

      if (
        current &&
        current.kind !== "none" &&
        (media.kind === "none" || current.url !== media.url)
      ) {
        URL.revokeObjectURL(current.url);
      }

      return {
        ...prev,
        [campaignId]: media,
      };
    });
  }

  function updateCampaign(patch: Partial<Campaign>) {
    if (!selected.campaign) return;

    setData((prev) => ({
      clients: prev.clients.map((client) => ({
        ...client,
        projects: client.projects.map((project) => ({
          ...project,
          campaigns: project.campaigns.map((campaign) =>
            campaign.id === selected.campaign?.id
              ? { ...campaign, ...patch, updatedAt: nowIso() }
              : campaign
          ),
        })),
      })),
    }));
  }

  function updateClient(clientId: string, patch: Partial<Client>) {
    setData((prev) => ({
      clients: prev.clients.map((client) =>
        client.id === clientId ? { ...client, ...patch } : client
      ),
    }));
  }

  function updateProject(projectId: string, patch: Partial<Project>) {
    setData((prev) => ({
      clients: prev.clients.map((client) => ({
        ...client,
        projects: client.projects.map((project) =>
          project.id === projectId ? { ...project, ...patch } : project
        ),
      })),
    }));
  }

  function removeCampaignMedia(campaignIds: string[]) {
    if (campaignIds.length === 0) return;
    setCampaignMediaById((prev) => {
      const next = { ...prev };
      for (const campaignId of campaignIds) {
        const media = next[campaignId];
        if (media && media.kind !== "none") {
          URL.revokeObjectURL(media.url);
        }
        delete next[campaignId];
      }
      return next;
    });
  }

  function deleteClient(clientId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    if (!client) return;

    if (!window.confirm(`Delete client "${client.name}" and all of its campaigns/ads?`)) {
      return;
    }

    const campaignIds = client.projects.flatMap((project) =>
      project.campaigns.map((campaign) => campaign.id)
    );
    const nextData: AppData = {
      clients: data.clients.filter((item) => item.id !== clientId),
    };

    removeCampaignMedia(campaignIds);
    setData(nextData);
    setSelection(defaultSelection(nextData));
    setEditorMode("campaign");
  }

  function deleteProject(clientId: string, projectId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    const project = client?.projects.find((item) => item.id === projectId);
    if (!project) return;

    if (!window.confirm(`Delete campaign "${project.name}" and all ads under it?`)) {
      return;
    }

    const campaignIds = project.campaigns.map((campaign) => campaign.id);
    const nextData: AppData = {
      clients: data.clients.map((item) => {
        if (item.id !== clientId) return item;
        return {
          ...item,
          projects: item.projects.filter((proj) => proj.id !== projectId),
        };
      }),
    };

    removeCampaignMedia(campaignIds);
    setData(nextData);
    setSelection(defaultSelection(nextData));
    setEditorMode("campaign-settings");
  }

  function deleteCampaign(clientId: string, projectId: string, campaignId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    const project = client?.projects.find((item) => item.id === projectId);
    const campaign = project?.campaigns.find((item) => item.id === campaignId);
    if (!campaign) return;

    if (!window.confirm(`Delete ad "${campaign.name}"?`)) {
      return;
    }

    const nextData: AppData = {
      clients: data.clients.map((item) => {
        if (item.id !== clientId) return item;
        return {
          ...item,
          projects: item.projects.map((proj) => {
            if (proj.id !== projectId) return proj;
            return {
              ...proj,
              campaigns: proj.campaigns.filter((cmp) => cmp.id !== campaignId),
            };
          }),
        };
      }),
    };

    removeCampaignMedia([campaignId]);
    setData(nextData);
    setSelection(defaultSelection(nextData));
    setEditorMode("campaign");
  }

  function commitAudienceProfilesDraft() {
    if (!selectedProject) return;
    const nextProfiles = linesToList(audienceProfilesDraft);
    updateProject(selectedProject.id, { audienceProfiles: nextProfiles });
    setCampaignSettingsDraftByProjectId((prev) => {
      const next = { ...prev };
      delete next[selectedProject.id];
      return next;
    });
  }

  function commitMessagePillarsDraft() {
    if (!selectedProject) return;
    const nextPillars = linesToList(messagePillarsDraft);
    updateProject(selectedProject.id, { messagePillars: nextPillars });
    setCampaignSettingsDraftByProjectId((prev) => {
      const next = { ...prev };
      delete next[selectedProject.id];
      return next;
    });
  }

  function addClient() {
    const newClient: Client = {
      id: newId("cl"),
      name: `Client ${data.clients.length + 1}`,
      projects: [newProject("Project 1", [newCampaign("Ad One")])],
    };

    setData((prev) => ({ clients: [...prev.clients, newClient] }));
    setSelection({
      clientId: newClient.id,
      projectId: newClient.projects[0].id,
      campaignId: newClient.projects[0].campaigns[0].id,
    });
    setEditorMode("client");
  }

  function addProject(clientId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    if (!client) return;

    const project = newProject(`Project ${client.projects.length + 1}`, [newCampaign("Ad One")]);

    setData((prev) => ({
      clients: prev.clients.map((client) => {
        if (client.id !== clientId) return client;

        return { ...client, projects: [...client.projects, project] };
      }),
    }));

    setSelection({
      clientId,
      projectId: project.id,
      campaignId: project.campaigns[0].id,
    });
    setEditorMode("campaign-settings");
  }

  function addCampaign(clientId: string, projectId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    const project = client?.projects.find((item) => item.id === projectId);
    if (!project) return;

    const campaign = newCampaign(`Ad ${project.campaigns.length + 1}`, {
      defaultCta: project.defaultCta,
      audienceProfile: normalizeStringList(project.audienceProfiles)[0] ?? "",
      messagePillar: normalizeStringList(project.messagePillars)[0] ?? "",
    });

    setData((prev) => ({
      clients: prev.clients.map((client) => ({
        ...client,
        projects: client.projects.map((project) => {
          if (client.id !== clientId || project.id !== projectId) return project;
          return { ...project, campaigns: [...project.campaigns, campaign] };
        }),
      })),
    }));

    setSelection({ clientId, projectId, campaignId: campaign.id });
    setEditorMode("campaign");
  }

  function beginClientEdit(clientId: string, value: string) {
    setEditingName({ kind: "client", clientId, value });
  }

  function beginProjectEdit(clientId: string, projectId: string, value: string) {
    setEditingName({ kind: "project", clientId, projectId, value });
  }

  function beginCampaignEdit(
    clientId: string,
    projectId: string,
    campaignId: string,
    value: string
  ) {
    setEditingName({ kind: "campaign", clientId, projectId, campaignId, value });
  }

  function updateEditingName(value: string) {
    setEditingName((current) => (current ? { ...current, value } : current));
  }

  function cancelInlineEdit() {
    setEditingName(null);
  }

  function commitInlineEdit() {
    if (!editingName) return;

    const nextName = editingName.value.trim();
    const target = editingName;
    setEditingName(null);

    if (!nextName) return;

    if (target.kind === "client") {
      setData((prev) => ({
        clients: prev.clients.map((client) =>
          client.id === target.clientId ? { ...client, name: nextName } : client
        ),
      }));
      return;
    }

    setData((prev) => ({
      clients: prev.clients.map((client) => {
        if (client.id !== target.clientId) return client;

        return {
          ...client,
          projects: client.projects.map((project) => {
            if (target.kind === "project" && project.id === target.projectId) {
              return { ...project, name: nextName };
            }

            if (target.kind === "campaign" && project.id === target.projectId) {
              return {
                ...project,
                campaigns: project.campaigns.map((campaign) =>
                  campaign.id === target.campaignId
                    ? { ...campaign, name: nextName, updatedAt: nowIso() }
                    : campaign
                ),
              };
            }

            return project;
          }),
        };
      }),
    }));
  }

  function onInlineEditKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitInlineEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit();
    }
  }

  function exportSelectedCampaignCsv() {
    if (!selected.client || !selected.project || !selected.campaign) {
      return;
    }

    const c = selected.campaign;

    downloadCsv(
      `${c.name.replace(/\s+/g, "-").toLowerCase() || "campaign"}.csv`,
      [
        "client",
        "project",
        "campaign",
        "platform",
        "media_aspect",
        "primary_text",
        "cta",
        "cta_bg_color",
        "cta_text_color",
        "updated_at",
      ],
      [
        selected.client.name,
        selected.project.name,
        c.name,
        c.platform,
        c.mediaAspect,
        c.primaryText,
        c.cta,
        c.ctaBgColor,
        c.ctaTextColor,
        c.updatedAt,
      ]
    );
  }

  async function onClientProfileImagePick(file: File) {
    if (!selectedClient) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateClient(selectedClient.id, { profileImageDataUrl: dataUrl });
    } catch {
      alert("Unable to load selected image. Please try another file.");
    }
  }

  return (
    <div className="app-shell" style={SHELL_FALLBACK_STYLE}>
      <aside className="pane pane-sidebar" style={SIDEBAR_FALLBACK_STYLE}>
        <div className="pane-header">
          <h2>Clients</h2>
          <button type="button" className="btn btn-subtle" onClick={addClient}>
            + Client
          </button>
        </div>
        <p className="muted">Double-click a name to rename it inline.</p>

        <div className="tree">
          {data.clients.map((client) => (
            <div key={client.id} className="tree-client">
              <div className="tree-row">
                {editingName?.kind === "client" && editingName.clientId === client.id ? (
                  <input
                    className="tree-inline-input"
                    value={editingName.value}
                    onChange={(event) => updateEditingName(event.target.value)}
                    onBlur={commitInlineEdit}
                    onKeyDown={onInlineEditKeyDown}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className={`tree-item ${selection.clientId === client.id ? "is-selected" : ""}`}
                    onClick={() => {
                      const project = client.projects[0];
                      const campaign = project?.campaigns[0];
                      setSelection({
                        clientId: client.id,
                        projectId: project?.id ?? "",
                        campaignId: campaign?.id ?? "",
                      });
                      setEditorMode("client");
                    }}
                    onDoubleClick={() => beginClientEdit(client.id, client.name)}
                  >
                    {client.name}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-micro"
                  onClick={() => addProject(client.id)}
                  title="Add project"
                >
                  + Project
                </button>
                <button
                  type="button"
                  className="btn btn-micro"
                  onClick={() => deleteClient(client.id)}
                  title="Delete client"
                >
                  🗑️
                </button>
              </div>

              {client.projects.map((project) => (
                <div key={project.id} className="tree-project">
                  <div className="tree-row">
                    {editingName?.kind === "project" &&
                    editingName.clientId === client.id &&
                    editingName.projectId === project.id ? (
                      <input
                        className="tree-inline-input"
                        value={editingName.value}
                        onChange={(event) => updateEditingName(event.target.value)}
                        onBlur={commitInlineEdit}
                        onKeyDown={onInlineEditKeyDown}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className={`tree-item tree-subitem ${selection.projectId === project.id ? "is-selected" : ""}`}
                        onClick={() => {
                          const firstCampaign = project.campaigns[0];
                          setSelection({
                            clientId: client.id,
                            projectId: project.id,
                            campaignId: firstCampaign?.id ?? "",
                          });
                          setEditorMode("campaign-settings");
                        }}
                        onDoubleClick={() =>
                          beginProjectEdit(client.id, project.id, project.name)
                        }
                      >
                        {project.name}
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-micro"
                      onClick={() => addCampaign(client.id, project.id)}
                      title="Add campaign"
                    >
                      + Ad
                    </button>
                    <button
                      type="button"
                      className="btn btn-micro"
                      onClick={() => deleteProject(client.id, project.id)}
                      title="Delete campaign"
                    >
                      🗑️
                    </button>
                  </div>

                  {project.campaigns.map((campaign) => (
                    <div key={campaign.id} className="tree-row">
                      {editingName?.kind === "campaign" &&
                      editingName.clientId === client.id &&
                      editingName.projectId === project.id &&
                      editingName.campaignId === campaign.id ? (
                        <input
                          className="tree-inline-input"
                          value={editingName.value}
                          onChange={(event) => updateEditingName(event.target.value)}
                          onBlur={commitInlineEdit}
                          onKeyDown={onInlineEditKeyDown}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className={`tree-item tree-campaign ${selection.campaignId === campaign.id ? "is-selected" : ""}`}
                          onClick={() =>
                            {
                              setSelection({
                                clientId: client.id,
                                projectId: project.id,
                                campaignId: campaign.id,
                              });
                              setEditorMode("campaign");
                            }
                          }
                          onDoubleClick={() =>
                            beginCampaignEdit(
                              client.id,
                              project.id,
                              campaign.id,
                              campaign.name
                            )
                          }
                        >
                          {campaign.name}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-micro"
                        onClick={() =>
                          deleteCampaign(client.id, project.id, campaign.id)
                        }
                        title="Delete ad"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <main className="pane pane-editor" style={EDITOR_FALLBACK_STYLE}>
        <div className="pane-header">
          <h2>
            {editorMode === "client"
              ? "Client Settings"
              : editorMode === "campaign-settings"
                ? "Campaign Settings"
                : "Ad Editor"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {editorMode !== "client" && selectedProject && (
              <>
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => setEditorMode("campaign-settings")}
                >
                  Campaign Settings
                </button>
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => setEditorMode("campaign")}
                  disabled={!selectedCampaign}
                >
                  Ad Editor
                </button>
              </>
            )}
            {editorMode === "campaign" && (
              <button type="button" className="btn" onClick={exportSelectedCampaignCsv}>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {editorMode === "client" && selectedClient && (
          <div className="form-grid">
            <label className="field">
              <span>Client Name</span>
              <input
                value={selectedClient.name}
                onChange={(event) =>
                  updateClient(selectedClient.id, { name: event.target.value })
                }
                placeholder="Client name"
              />
            </label>

            <label className="field">
              <span>Profile Image (applies to all projects and ads)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    border: "1px solid #d9dde3",
                    background: selectedClient.profileImageDataUrl
                      ? `center / cover no-repeat url(${selectedClient.profileImageDataUrl})`
                      : "#9da5b1",
                    flexShrink: 0,
                  }}
                />
                <label className="btn btn-subtle" style={{ cursor: "pointer" }}>
                  Upload PFP
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      onClientProfileImagePick(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {selectedClient.profileImageDataUrl && (
                  <button
                    type="button"
                    className="btn btn-subtle"
                    onClick={() =>
                      updateClient(selectedClient.id, { profileImageDataUrl: undefined })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </label>
          </div>
        )}

        {editorMode === "campaign-settings" && !selectedProject && (
          <p>Select a project to edit campaign-level settings.</p>
        )}

        {editorMode === "campaign-settings" && selectedProject && (
          <div className="form-grid">
            <label className="field">
              <span>Campaign Name</span>
              <input
                value={selectedProject.name}
                onChange={(event) => updateProject(selectedProject.id, { name: event.target.value })}
                placeholder="Campaign name"
              />
            </label>

            <label className="field">
              <span>Objective</span>
              <select
                value={selectedProject.objective}
                onChange={(event) =>
                  updateProject(selectedProject.id, {
                    objective: event.target.value as CampaignObjective,
                  })
                }
              >
                {CAMPAIGN_OBJECTIVE_OPTIONS.map((objective) => (
                  <option key={objective} value={objective}>
                    {objective}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Primary Goal</span>
              <input
                value={selectedProject.primaryGoal}
                onChange={(event) =>
                  updateProject(selectedProject.id, { primaryGoal: event.target.value })
                }
                placeholder="What should this campaign achieve?"
              />
            </label>

            <label className="field">
              <span>Default CTA for New Ads</span>
              <select
                value={selectedProject.defaultCta}
                onChange={(event) =>
                  updateProject(selectedProject.id, {
                    defaultCta: event.target.value as CtaOption,
                  })
                }
              >
                {CTA_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Audience Profiles (one per line)</span>
              <textarea
                rows={6}
                value={audienceProfilesDraft}
                onChange={(event) => {
                  if (!selectedProject) return;
                  setCampaignSettingsDraftByProjectId((prev) => ({
                    ...prev,
                    [selectedProject.id]: {
                      audienceProfilesText: event.target.value,
                      messagePillarsText: prev[selectedProject.id]?.messagePillarsText ?? messagePillarsDraft,
                    },
                  }));
                }}
                onBlur={commitAudienceProfilesDraft}
                placeholder={"Homeowners\nFirst-time buyers\nLuxury travelers"}
              />
            </label>

            <label className="field">
              <span>Message Pillars (one per line)</span>
              <textarea
                rows={6}
                value={messagePillarsDraft}
                onChange={(event) => {
                  if (!selectedProject) return;
                  setCampaignSettingsDraftByProjectId((prev) => ({
                    ...prev,
                    [selectedProject.id]: {
                      audienceProfilesText: prev[selectedProject.id]?.audienceProfilesText ?? audienceProfilesDraft,
                      messagePillarsText: event.target.value,
                    },
                  }));
                }}
                onBlur={commitMessagePillarsDraft}
                placeholder={"Social proof\nConvenience\nLimited-time offer"}
              />
            </label>

            <label className="field">
              <span>Guardrails / Notes</span>
              <textarea
                rows={5}
                value={selectedProject.guardrails}
                onChange={(event) =>
                  updateProject(selectedProject.id, { guardrails: event.target.value })
                }
                placeholder="Must include approved tagline; avoid competitor comparisons."
              />
            </label>
          </div>
        )}

        {editorMode === "campaign" && !selectedCampaign && (
          <p>Select or create a campaign to start editing.</p>
        )}

        {editorMode === "campaign" && selectedCampaign && (
          <div className="form-grid">
            <label className="field">
              <span>Campaign Name</span>
              <input
                value={selectedCampaign.name}
                onChange={(event) => updateCampaign({ name: event.target.value })}
                placeholder="Campaign name"
              />
            </label>

            <label className="field">
              <span>Platform</span>
              <select
                value={selectedCampaign.platform}
                onChange={(event) => {
                  const nextPlatform = event.target.value as Platform;
                  updateCampaign({
                    platform: nextPlatform,
                    mediaAspect: normalizeAspectForPlatform(
                      nextPlatform,
                      selectedCampaign?.mediaAspect ?? "1:1"
                    ),
                  });
                }}
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Media Ratio</span>
              {isStoryLikePlatform(selectedCampaign.platform) ? (
                <input value="9:16 (Story default)" readOnly />
              ) : (
                <select
                  value={selectedCampaign.mediaAspect}
                  onChange={(event) =>
                    updateCampaign({ mediaAspect: event.target.value as MediaAspect })
                  }
                >
                  {FEED_ASPECT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="field">
              <span>Body Copy</span>
              <textarea
                value={selectedCampaign.primaryText}
                onChange={(event) => updateCampaign({ primaryText: event.target.value })}
                placeholder="Write the ad body copy"
                rows={8}
              />
            </label>

            <label className="field">
              <span>Audience Profile</span>
              <select
                value={selectedCampaign.audienceProfile}
                onChange={(event) => updateCampaign({ audienceProfile: event.target.value })}
              >
                <option value="">Select audience profile</option>
                {audienceProfileOptions.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
                {selectedCampaign.audienceProfile &&
                  !audienceProfileOptions.includes(selectedCampaign.audienceProfile) && (
                    <option value={selectedCampaign.audienceProfile}>
                      {selectedCampaign.audienceProfile} (Custom)
                    </option>
                  )}
              </select>
            </label>

            <label className="field">
              <span>Message Pillar</span>
              <select
                value={selectedCampaign.messagePillar}
                onChange={(event) => updateCampaign({ messagePillar: event.target.value })}
              >
                <option value="">Select message pillar</option>
                {messagePillarOptions.map((pillar) => (
                  <option key={pillar} value={pillar}>
                    {pillar}
                  </option>
                ))}
                {selectedCampaign.messagePillar &&
                  !messagePillarOptions.includes(selectedCampaign.messagePillar) && (
                    <option value={selectedCampaign.messagePillar}>
                      {selectedCampaign.messagePillar} (Custom)
                    </option>
                  )}
              </select>
            </label>

            <label className="field">
              <span>CTA</span>
              <select
                value={selectedCampaign.cta}
                onChange={(event) => updateCampaign({ cta: event.target.value as CtaOption })}
              >
                {CTA_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>CTA Bar Color</span>
              <input
                type="color"
                value={selectedCampaign.ctaBgColor}
                onChange={(event) => updateCampaign({ ctaBgColor: event.target.value })}
              />
            </label>

            <label className="field">
              <span>CTA Text Color</span>
              <input
                type="color"
                value={selectedCampaign.ctaTextColor}
                onChange={(event) => updateCampaign({ ctaTextColor: event.target.value })}
              />
            </label>
          </div>
        )}
      </main>

      <section className="pane pane-preview">
        <div className="pane-header">
          <h2>Preview</h2>
          <p className="muted">Drop image/video, then export PNG.</p>
        </div>

        <PreviewCanvas
          primaryText={selected.campaign?.primaryText ?? ""}
          cta={selected.campaign?.cta ?? "Learn More"}
          ctaBgColor={selected.campaign?.ctaBgColor ?? DEFAULT_CTA_BG_COLOR}
          ctaTextColor={selected.campaign?.ctaTextColor ?? DEFAULT_CTA_TEXT_COLOR}
          platform={selected.campaign?.platform ?? "Instagram Feed"}
          mediaAspect={selected.campaign?.mediaAspect ?? "1:1"}
          clientName={selectedClient?.name ?? "Client"}
          clientAvatarUrl={selectedClient?.profileImageDataUrl}
          media={selectedCampaignMedia}
          onMediaChange={(media) => {
            if (!selection.campaignId) return;
            setCampaignMedia(selection.campaignId, media);
          }}
        />
      </section>
    </div>
  );
}
