"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import JSZip from "jszip";
import {
  PreviewCanvas,
  type PreviewMedia,
  type PreviewCanvasHandle,
} from "@/components/PreviewCanvas";
import { FeedScroll } from "@/components/FeedScroll";
import { StoryFeedScroll } from "@/components/StoryFeedScroll";
import { FacebookFeedScroll } from "@/components/FacebookFeedScroll";
import { TikTokFeedScroll } from "@/components/TikTokFeedScroll";
import { ReelsFeedScroll } from "@/components/ReelsFeedScroll";

// ─── Types ───────────────────────────────────────────────────────

type Platform =
  | "Instagram Feed"
  | "Instagram Story"
  | "Instagram Reels"
  | "Facebook Feed"
  | "TikTok";

type WorkspaceKind = "local"; // future: "collaborative" | "personal"
type Workspace = { id: string; name: string; kind: WorkspaceKind };

type CtaOption = "Learn More" | "Shop Now" | "Sign Up" | "Download";
type MediaAspect = "1:1" | "3:4" | "9:16";
type CampaignObjective = "Awareness" | "Consideration" | "Conversion";
type CampaignStatus = "draft" | "ready";
type SelectionLevel = "client" | "project" | "campaign";
// EditorMode kept minimal — Campaign tab removed, only Ad editor remains

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
  status: CampaignStatus;
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

type AppData = { clients: Client[] };

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

type PendingUndo = {
  label: string;
  restore: () => void;
  timerId: ReturnType<typeof setTimeout>;
};

// ─── Constants ───────────────────────────────────────────────────

const LEGACY_STORAGE_KEY = "socialize.v1.workspace"; // for migration only
const UI_KEY = "socialize.v1.ui";
const WORKSPACES_KEY = "socialize.workspaces";
const ACTIVE_WS_KEY = "socialize.activeWs";
const WS_DATA_PREFIX = "socialize.ws.";

const PLATFORM_OPTIONS: Platform[] = [
  "Instagram Feed",
  "Instagram Story",
  "Instagram Reels",
  "Facebook Feed",
  "TikTok",
];
const CTA_OPTIONS: CtaOption[] = [
  "Learn More",
  "Shop Now",
  "Sign Up",
  "Download",
];
const OBJECTIVE_OPTIONS: CampaignObjective[] = [
  "Awareness",
  "Consideration",
  "Conversion",
];
const FEED_ASPECT_OPTIONS: MediaAspect[] = ["1:1", "3:4"];
const DEFAULT_CTA_BG = "#4f94aa";
const EMPTY_MEDIA: PreviewMedia = { kind: "none" };

// ─── Helpers ─────────────────────────────────────────────────────

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isStoryPlatform(p: Platform): boolean {
  return p === "Instagram Story" || p === "Instagram Reels" || p === "TikTok";
}

function normalizeAspect(
  platform: Platform,
  aspect: MediaAspect | undefined
): MediaAspect {
  if (isStoryPlatform(platform)) return "9:16";
  if (aspect === "3:4") return "3:4";
  return "1:1";
}

function normalizeHex(v: string | undefined, fb: string): string {
  if (typeof v !== "string") return fb;
  const t = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t.toLowerCase() : fb;
}

function contrastText(bg: string): string {
  const hex = normalizeHex(bg, DEFAULT_CTA_BG);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b >= 155 ? "#111111" : "#ffffff";
}

function normalizeObjective(v: unknown): CampaignObjective {
  if (v === "Consideration" || v === "Conversion") return v;
  return "Awareness";
}

function normalizeStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

function linesToList(v: string): string[] {
  return v
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
}

function listToLines(v: string[]): string {
  return v.join("\n");
}

function newCampaign(
  name: string,
  opts?: { defaultCta?: CtaOption; audienceProfile?: string; messagePillar?: string }
): Campaign {
  const ctaBgColor = DEFAULT_CTA_BG;
  return {
    id: newId("cmp"),
    name,
    platform: "Instagram Feed",
    mediaAspect: "1:1",
    primaryText: "",
    cta: opts?.defaultCta ?? "Learn More",
    audienceProfile: opts?.audienceProfile ?? "",
    messagePillar: opts?.messagePillar ?? "",
    ctaBgColor,
    ctaTextColor: contrastText(ctaBgColor),
    status: "draft",
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

function normalizeCampaign(c: Campaign): Campaign {
  const ctaBgColor = normalizeHex(
    (c as { ctaBgColor?: string }).ctaBgColor,
    DEFAULT_CTA_BG
  );
  return {
    ...c,
    mediaAspect: normalizeAspect(c.platform, c.mediaAspect),
    audienceProfile:
      typeof (c as { audienceProfile?: unknown }).audienceProfile === "string"
        ? (c.audienceProfile ?? "")
        : "",
    messagePillar:
      typeof (c as { messagePillar?: unknown }).messagePillar === "string"
        ? (c.messagePillar ?? "")
        : "",
    status:
      (c as { status?: unknown }).status === "ready" ? "ready" : "draft",
    ctaBgColor,
    ctaTextColor: contrastText(ctaBgColor),
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
        objective: normalizeObjective(
          (project as { objective?: unknown }).objective
        ),
        primaryGoal:
          typeof (project as { primaryGoal?: unknown }).primaryGoal === "string"
            ? (project as { primaryGoal?: string }).primaryGoal ?? ""
            : "",
        defaultCta:
          CTA_OPTIONS.includes(
            (project as { defaultCta?: CtaOption }).defaultCta as CtaOption
          )
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
        campaigns: project.campaigns.map(normalizeCampaign),
      })),
    })),
  };
}

function emptyWorkspace(): AppData {
  return { clients: [] };
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

function loadWorkspaceList(): Workspace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (raw) {
      const list = JSON.parse(raw) as Workspace[];
      if (Array.isArray(list) && list.length > 0) return list;
    }
    // Migration: check legacy key
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const defaultWs: Workspace = { id: "ws_default", name: "My Workspace", kind: "local" };
      const parsed = JSON.parse(legacy) as { data?: AppData; selection?: Selection; level?: SelectionLevel };
      if (parsed?.data?.clients) {
        // Migrate data to new key
        localStorage.setItem(WS_DATA_PREFIX + defaultWs.id, legacy);
        localStorage.setItem(WORKSPACES_KEY, JSON.stringify([defaultWs]));
        localStorage.setItem(ACTIVE_WS_KEY, defaultWs.id);
        return [defaultWs];
      }
    }
    const defaultWs: Workspace = { id: "ws_default", name: "My Workspace", kind: "local" };
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify([defaultWs]));
    return [defaultWs];
  } catch {
    return [{ id: "ws_default", name: "My Workspace", kind: "local" }];
  }
}

function loadActiveWsId(workspaces: Workspace[]): string {
  if (typeof window === "undefined") return workspaces[0]?.id ?? "ws_default";
  const stored = localStorage.getItem(ACTIVE_WS_KEY);
  if (stored && workspaces.find((w) => w.id === stored)) return stored;
  return workspaces[0]?.id ?? "ws_default";
}

function loadWorkspaceData(wsId: string): { data: AppData; selection: Selection; level: SelectionLevel } {
  if (typeof window === "undefined") {
    const data = emptyWorkspace();
    return { data, selection: defaultSelection(data), level: "campaign" };
  }
  try {
    const raw = localStorage.getItem(WS_DATA_PREFIX + wsId);
    if (!raw) {
      const data = emptyWorkspace();
      return { data, selection: defaultSelection(data), level: "campaign" };
    }
    const parsed = JSON.parse(raw) as {
      data?: AppData;
      selection?: Selection;
      level?: SelectionLevel;
    };
    if (!parsed?.data?.clients) {
      const data = emptyWorkspace();
      return { data, selection: defaultSelection(data), level: "campaign" };
    }
    const data = normalizeData(parsed.data);
    const sel = parsed.selection ?? defaultSelection(data);
    const level: SelectionLevel =
      parsed.level === "client" || parsed.level === "project" ? parsed.level : "campaign";
    return { data, selection: sel, level };
  } catch {
    const data = emptyWorkspace();
    return { data, selection: defaultSelection(data), level: "campaign" };
  }
}

function loadUiPrefs(): { panelWidths: [number, number]; darkMode: boolean } {
  if (typeof window === "undefined") return { panelWidths: [260, 420], darkMode: false };
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return { panelWidths: [260, 420], darkMode: false };
    const parsed = JSON.parse(raw) as { panelWidths?: [number, number]; darkMode?: boolean };
    return {
      panelWidths: Array.isArray(parsed.panelWidths) ? parsed.panelWidths : [260, 420],
      darkMode: typeof parsed.darkMode === "boolean" ? parsed.darkMode : false,
    };
  } catch {
    return { panelWidths: [260, 420], darkMode: false };
  }
}

function formatCsvCell(v: string): string {
  const n = v.replace(/\r?\n/g, " ");
  return /[",]/.test(n) ? `"${n.replaceAll('"', '""')}"` : n;
}

function generateProjectCsv(client: Client, project: Project): string {
  const header = [
    "client",
    "project",
    "objective",
    "primary_goal",
    "default_cta",
    "guardrails",
    "ad_name",
    "platform",
    "media_aspect",
    "audience_profile",
    "message_pillar",
    "primary_text",
    "cta",
    "cta_bg_color",
    "cta_text_color",
    "status",
    "updated_at",
  ].join(",");

  const rows = project.campaigns.map((c) =>
    [
      formatCsvCell(client.name),
      formatCsvCell(project.name),
      formatCsvCell(project.objective),
      formatCsvCell(project.primaryGoal),
      formatCsvCell(project.defaultCta),
      formatCsvCell(project.guardrails),
      formatCsvCell(c.name),
      formatCsvCell(c.platform),
      formatCsvCell(c.mediaAspect),
      formatCsvCell(c.audienceProfile),
      formatCsvCell(c.messagePillar),
      formatCsvCell(c.primaryText),
      formatCsvCell(c.cta),
      formatCsvCell(c.ctaBgColor),
      formatCsvCell(c.ctaTextColor),
      formatCsvCell(c.status),
      formatCsvCell(c.updatedAt),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

// ─── Inline SVG Icons ─────────────────────────────────────────────

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="currentColor"
      style={{ transition: "transform 150ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <path d="M3 2l4 3-4 3V2z" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M2 3l3 4 3-4H2z" />
    </svg>
  );
}

function IconWorkspace() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconDuplicate() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

// ─── ResizeHandle component ───────────────────────────────────────

function ResizeHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const onMove = (ev: PointerEvent) => onDrag(ev.movementX);
      const onUp = () => {
        setDragging(false);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [onDrag]
  );

  return (
    <div
      className={`resize-handle${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────

const DEFAULT_WS: Workspace = { id: "ws_default", name: "My Workspace", kind: "local" };
const DEFAULT_EMPTY_DATA = emptyWorkspace();
const DEFAULT_SELECTION: Selection = { clientId: "", projectId: "", campaignId: "" };

export default function Home() {
  // Workspace — start with static defaults to match SSR, then load from localStorage after mount
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_WS]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(DEFAULT_WS.id);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);

  const [data, setData] = useState<AppData>(DEFAULT_EMPTY_DATA);
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [selectionLevel, setSelectionLevel] = useState<SelectionLevel>("campaign");

  // Panel widths: sidebar, editor (preview fills remaining)
  const [panelWidths, setPanelWidths] = useState<[number, number]>([260, 420]);

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);

  // Load from localStorage after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    const wsList = loadWorkspaceList();
    const wsId = loadActiveWsId(wsList);
    const wsData = loadWorkspaceData(wsId);
    const ui = loadUiPrefs();
    setWorkspaces(wsList);
    setActiveWorkspaceId(wsId);
    setData(wsData.data);
    setSelection(wsData.selection);
    setSelectionLevel(wsData.level);
    setPanelWidths(ui.panelWidths);
    setDarkMode(ui.darkMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Export panel
  const [exportPanelOpen, setExportPanelOpen] = useState(false);

  // Undo
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // Preview
  const [feedMode, setFeedMode] = useState<"frame" | "feed">("frame");
  const [frameZoom, setFrameZoom] = useState(1);
  const [feedZoom, setFeedZoom] = useState(1);

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Inline renaming
  const [editingName, setEditingName] = useState<EditingName | null>(null);

  // Tree expand/collapse
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // Campaign settings drafts
  const [settingsDraft, setSettingsDraft] = useState<
    Record<string, { audienceText: string; pillarsText: string }>
  >({});

  // Media per campaign
  const [campaignMedia, setCampaignMediaMap] = useState<Record<string, PreviewMedia>>({});
  const campaignMediaRef = useRef<Record<string, PreviewMedia>>({});

  // Copy flash
  const [copyFlash, setCopyFlash] = useState(false);

  // Canvas ref for export
  const canvasRef = useRef<PreviewCanvasHandle>(null);

  // Preview body ref for auto-zoom
  const previewBodyRef = useRef<HTMLDivElement>(null);

  // ── Persistence ────────────────────────────────────────────────

  // Persist workspace list + active workspace id
  useEffect(() => {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_WS_KEY, activeWorkspaceId);
  }, [activeWorkspaceId]);

  // Persist current workspace data
  useEffect(() => {
    localStorage.setItem(
      WS_DATA_PREFIX + activeWorkspaceId,
      JSON.stringify({ data, selection, level: selectionLevel })
    );
  }, [data, selection, selectionLevel, activeWorkspaceId]);

  useEffect(() => {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({ panelWidths, darkMode })
    );
  }, [panelWidths, darkMode]);

  useEffect(() => {
    campaignMediaRef.current = campaignMedia;
  }, [campaignMedia]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const m of Object.values(campaignMediaRef.current)) {
        if (m.kind !== "none") URL.revokeObjectURL(m.url);
      }
    };
  }, []);

  // Apply dark mode to html element
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light"
    );
  }, [darkMode]);

  // ZOOM_BASE: "100%" in the UI = scale(1.4) visually — what previously showed at 140%
  const ZOOM_BASE = 1.4;

  // Auto-zoom preview to fit pane — independent per mode
  useEffect(() => {
    const el = previewBodyRef.current;
    if (!el) return;
    const CONTENT_W = 300;
    const CONTENT_H = Math.round(300 * (2969 / 1842)); // ≈ 484, same for frame and feed
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      // Divide by ZOOM_BASE so auto-fit initializes at zoom=1.0 (= 100% display, scale(1.4) visually)
      const rawZoom = Math.min((width - 32) / CONTENT_W, (height - 32) / CONTENT_H);
      const clamped = Math.min(1.4, Math.max(0.35, +(rawZoom / ZOOM_BASE).toFixed(2)));
      setFrameZoom(clamped);
      setFeedZoom(clamped);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived ────────────────────────────────────────────────────

  const selectedClient = useMemo(
    () => data.clients.find((c) => c.id === selection.clientId),
    [data, selection.clientId]
  );
  const selectedProject = useMemo(
    () => selectedClient?.projects.find((p) => p.id === selection.projectId),
    [selectedClient, selection.projectId]
  );
  const selectedCampaign = useMemo(
    () => selectedProject?.campaigns.find((c) => c.id === selection.campaignId),
    [selectedProject, selection.campaignId]
  );
  const selectedMedia = campaignMedia[selection.campaignId] ?? EMPTY_MEDIA;

  const audienceOptions = useMemo(
    () => normalizeStringList(selectedProject?.audienceProfiles),
    [selectedProject?.audienceProfiles]
  );
  const pillarOptions = useMemo(
    () => normalizeStringList(selectedProject?.messagePillars),
    [selectedProject?.messagePillars]
  );

  const projectDraft = selectedProject
    ? settingsDraft[selectedProject.id]
    : undefined;
  const audienceDraft =
    projectDraft?.audienceText ?? listToLines(selectedProject?.audienceProfiles ?? []);
  const pillarsDraft =
    projectDraft?.pillarsText ?? listToLines(selectedProject?.messagePillars ?? []);

  // ── Media helpers ──────────────────────────────────────────────

  function setCampaignMedia(campaignId: string, media: PreviewMedia) {
    setCampaignMediaMap((prev) => {
      const cur = prev[campaignId];
      if (cur && cur.kind !== "none" && (media.kind === "none" || cur.url !== media.url)) {
        URL.revokeObjectURL(cur.url);
      }
      return { ...prev, [campaignId]: media };
    });
  }

  function cleanupCampaignMedia(ids: string[]) {
    setCampaignMediaMap((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const m = next[id];
        if (m && m.kind !== "none") URL.revokeObjectURL(m.url);
        delete next[id];
      }
      return next;
    });
  }

  // ── Workspace management ───────────────────────────────────────

  function switchWorkspace(wsId: string) {
    if (wsId === activeWorkspaceId) { setWsDropdownOpen(false); return; }
    // Save current workspace data before switching
    localStorage.setItem(
      WS_DATA_PREFIX + activeWorkspaceId,
      JSON.stringify({ data, selection, level: selectionLevel })
    );
    const { data: newData, selection: newSel, level: newLevel } = loadWorkspaceData(wsId);
    setData(newData);
    setSelection(newSel);
    setSelectionLevel(newLevel);
    setActiveWorkspaceId(wsId);
    setWsDropdownOpen(false);
  }

  function createWorkspace() {
    const name = `Workspace ${workspaces.length + 1}`;
    const ws: Workspace = { id: newId("ws"), name, kind: "local" };
    // Save current workspace before switching
    localStorage.setItem(
      WS_DATA_PREFIX + activeWorkspaceId,
      JSON.stringify({ data, selection, level: selectionLevel })
    );
    const empty = emptyWorkspace();
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    setData(empty);
    setSelection(defaultSelection(empty));
    setSelectionLevel("campaign");
    setWsDropdownOpen(false);
  }

  function renameWorkspace(wsId: string, name: string) {
    setWorkspaces((prev) => prev.map((w) => w.id === wsId ? { ...w, name } : w));
  }

  // ── Soft delete with undo ──────────────────────────────────────

  function softDelete(label: string, deleteFn: () => void, restoreFn: () => void) {
    if (pendingUndo) clearTimeout(pendingUndo.timerId);
    deleteFn();
    const timerId = setTimeout(() => setPendingUndo(null), 5000);
    setPendingUndo({ label, restore: restoreFn, timerId });
  }

  function handleUndo() {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timerId);
    pendingUndo.restore();
    setPendingUndo(null);
  }

  // ── Update helpers ─────────────────────────────────────────────

  function updateCampaign(patch: Partial<Campaign>) {
    if (!selectedCampaign) return;
    const id = selectedCampaign.id;
    setData((prev) => ({
      clients: prev.clients.map((cl) => ({
        ...cl,
        projects: cl.projects.map((pr) => ({
          ...pr,
          campaigns: pr.campaigns.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c
          ),
        })),
      })),
    }));
  }

  function updateClient(clientId: string, patch: Partial<Client>) {
    setData((prev) => ({
      clients: prev.clients.map((cl) =>
        cl.id === clientId ? { ...cl, ...patch } : cl
      ),
    }));
  }

  function updateProject(projectId: string, patch: Partial<Project>) {
    setData((prev) => ({
      clients: prev.clients.map((cl) => ({
        ...cl,
        projects: cl.projects.map((pr) =>
          pr.id === projectId ? { ...pr, ...patch } : pr
        ),
      })),
    }));
  }

  // ── Add ────────────────────────────────────────────────────────

  function addClient() {
    const id = newId("cl");
    const project = newProject("Project 1", [newCampaign("Ad 1")]);
    const client: Client = { id, name: "New Client", projects: [project] };
    setData((prev) => ({ clients: [...prev.clients, client] }));
    setSelection({ clientId: id, projectId: project.id, campaignId: project.campaigns[0].id });
    setSelectionLevel("client");
    setExpandedClients((prev) => ({ ...prev, [id]: true }));
    beginClientEdit(id, "New Client");
  }

  function addProject(clientId: string) {
    const id = newId("prj");
    const campaign = newCampaign("Ad 1");
    const project = newProject("New Project", [campaign]);
    project.id = id;
    setData((prev) => ({
      clients: prev.clients.map((cl) =>
        cl.id === clientId
          ? { ...cl, projects: [...cl.projects, project] }
          : cl
      ),
    }));
    setSelection({ clientId, projectId: id, campaignId: campaign.id });
    setSelectionLevel("project");
    setExpandedProjects((prev) => ({ ...prev, [id]: true }));
    beginProjectEdit(clientId, id, "New Project");
  }

  function addCampaign(clientId: string, projectId: string) {
    const campaign = newCampaign("New Ad");
    setData((prev) => ({
      clients: prev.clients.map((cl) =>
        cl.id !== clientId
          ? cl
          : {
              ...cl,
              projects: cl.projects.map((pr) =>
                pr.id !== projectId
                  ? pr
                  : { ...pr, campaigns: [...pr.campaigns, campaign] }
              ),
            }
      ),
    }));
    setSelection({ clientId, projectId, campaignId: campaign.id });
    setSelectionLevel("campaign");
  }

  // ── Delete ─────────────────────────────────────────────────────

  function deleteClient(clientId: string) {
    const client = data.clients.find((c) => c.id === clientId);
    if (!client) return;
    const allCampaignIds = client.projects.flatMap((p) =>
      p.campaigns.map((c) => c.id)
    );
    const snapshot = { ...data };
    const selSnap = { ...selection };
    const levelSnap = selectionLevel;
    softDelete(`"${client.name}"`, () => {
      cleanupCampaignMedia(allCampaignIds);
      setData((prev) => ({ clients: prev.clients.filter((c) => c.id !== clientId) }));
      if (selection.clientId === clientId) {
        const remaining = data.clients.filter((c) => c.id !== clientId);
        const next = remaining[0];
        setSelection(next
          ? { clientId: next.id, projectId: next.projects[0]?.id ?? "", campaignId: next.projects[0]?.campaigns[0]?.id ?? "" }
          : { clientId: "", projectId: "", campaignId: "" }
        );
        setSelectionLevel("client");
      }
    }, () => {
      setData(snapshot);
      setSelection(selSnap);
      setSelectionLevel(levelSnap);
    });
  }

  function deleteProject(clientId: string, projectId: string) {
    const client = data.clients.find((c) => c.id === clientId);
    const project = client?.projects.find((p) => p.id === projectId);
    if (!project) return;
    const ids = project.campaigns.map((c) => c.id);
    const snapshot = { ...data };
    const selSnap = { ...selection };
    const levelSnap = selectionLevel;
    softDelete(`"${project.name}"`, () => {
      cleanupCampaignMedia(ids);
      setData((prev) => ({
        clients: prev.clients.map((cl) =>
          cl.id !== clientId
            ? cl
            : { ...cl, projects: cl.projects.filter((p) => p.id !== projectId) }
        ),
      }));
      if (selection.projectId === projectId) {
        const cl = data.clients.find((c) => c.id === clientId);
        const remaining = cl?.projects.filter((p) => p.id !== projectId) ?? [];
        const next = remaining[0];
        setSelection({
          clientId,
          projectId: next?.id ?? "",
          campaignId: next?.campaigns[0]?.id ?? "",
        });
        setSelectionLevel("client");
      }
    }, () => {
      setData(snapshot);
      setSelection(selSnap);
      setSelectionLevel(levelSnap);
    });
  }

  function deleteCampaign(clientId: string, projectId: string, campaignId: string) {
    const project = data.clients
      .find((c) => c.id === clientId)
      ?.projects.find((p) => p.id === projectId);
    const campaign = project?.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    const snapshot = { ...data };
    const selSnap = { ...selection };
    const levelSnap = selectionLevel;
    softDelete(`"${campaign.name}"`, () => {
      cleanupCampaignMedia([campaignId]);
      setData((prev) => ({
        clients: prev.clients.map((cl) =>
          cl.id !== clientId
            ? cl
            : {
                ...cl,
                projects: cl.projects.map((pr) =>
                  pr.id !== projectId
                    ? pr
                    : { ...pr, campaigns: pr.campaigns.filter((c) => c.id !== campaignId) }
                ),
              }
        ),
      }));
      if (selection.campaignId === campaignId) {
        const remaining = project?.campaigns.filter((c) => c.id !== campaignId) ?? [];
        const next = remaining[0];
        setSelection({
          clientId,
          projectId,
          campaignId: next?.id ?? "",
        });
        setSelectionLevel(next ? "campaign" : "project");
      }
    }, () => {
      setData(snapshot);
      setSelection(selSnap);
      setSelectionLevel(levelSnap);
    });
  }

  // ── Duplicate ──────────────────────────────────────────────────

  function duplicateClient(clientId: string) {
    const client = data.clients.find((c) => c.id === clientId);
    if (!client) return;
    const newClient: Client = {
      ...client,
      id: newId("cl"),
      name: `${client.name} (Copy)`,
      profileImageDataUrl: client.profileImageDataUrl,
      projects: client.projects.map((p) => ({
        ...p,
        id: newId("prj"),
        campaigns: p.campaigns.map((c) => ({
          ...normalizeCampaign(c),
          id: newId("cmp"),
          status: "draft" as CampaignStatus,
          updatedAt: nowIso(),
        })),
      })),
    };
    setData((prev) => {
      const idx = prev.clients.findIndex((c) => c.id === clientId);
      const next = [...prev.clients];
      next.splice(idx + 1, 0, newClient);
      return { clients: next };
    });
  }

  function duplicateProject(clientId: string, projectId: string) {
    const project = data.clients
      .find((c) => c.id === clientId)
      ?.projects.find((p) => p.id === projectId);
    if (!project) return;
    const newProj: Project = {
      ...project,
      id: newId("prj"),
      name: `${project.name} (Copy)`,
      campaigns: project.campaigns.map((c) => ({
        ...normalizeCampaign(c),
        id: newId("cmp"),
        status: "draft" as CampaignStatus,
        updatedAt: nowIso(),
      })),
    };
    setData((prev) => ({
      clients: prev.clients.map((cl) => {
        if (cl.id !== clientId) return cl;
        const idx = cl.projects.findIndex((p) => p.id === projectId);
        const next = [...cl.projects];
        next.splice(idx + 1, 0, newProj);
        return { ...cl, projects: next };
      }),
    }));
  }

  function duplicateCampaign(clientId: string, projectId: string, campaignId: string) {
    const campaign = data.clients
      .find((c) => c.id === clientId)
      ?.projects.find((p) => p.id === projectId)
      ?.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    const newC: Campaign = {
      ...normalizeCampaign(campaign),
      id: newId("cmp"),
      name: `${campaign.name} (Copy)`,
      status: "draft",
      updatedAt: nowIso(),
    };
    setData((prev) => ({
      clients: prev.clients.map((cl) =>
        cl.id !== clientId
          ? cl
          : {
              ...cl,
              projects: cl.projects.map((pr) => {
                if (pr.id !== projectId) return pr;
                const idx = pr.campaigns.findIndex((c) => c.id === campaignId);
                const next = [...pr.campaigns];
                next.splice(idx + 1, 0, newC);
                return { ...pr, campaigns: next };
              }),
            }
      ),
    }));
    setSelection({ clientId, projectId, campaignId: newC.id });
    setSelectionLevel("campaign");
  }

  // ── Inline editing ─────────────────────────────────────────────

  function beginClientEdit(clientId: string, value: string) {
    setEditingName({ kind: "client", clientId, value });
  }
  function beginProjectEdit(clientId: string, projectId: string, value: string) {
    setEditingName({ kind: "project", clientId, projectId, value });
  }
  function beginCampaignEdit(clientId: string, projectId: string, campaignId: string, value: string) {
    setEditingName({ kind: "campaign", clientId, projectId, campaignId, value });
  }

  function commitEdit() {
    if (!editingName) return;
    const trimmed = editingName.value.trim();
    if (!trimmed) { setEditingName(null); return; }
    if (editingName.kind === "client") {
      updateClient(editingName.clientId, { name: trimmed });
    } else if (editingName.kind === "project") {
      updateProject(editingName.projectId, { name: trimmed });
    } else {
      updateCampaign({ name: trimmed });
    }
    setEditingName(null);
  }

  function cancelEdit() { setEditingName(null); }

  function onEditKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") cancelEdit();
  }

  // ── Settings drafts ────────────────────────────────────────────

  function commitAudienceDraft() {
    if (!selectedProject) return;
    updateProject(selectedProject.id, {
      audienceProfiles: linesToList(audienceDraft),
    });
    setSettingsDraft((prev) => ({
      ...prev,
      [selectedProject.id]: { ...(prev[selectedProject.id] ?? { audienceText: "", pillarsText: "" }), audienceText: audienceDraft },
    }));
  }

  function commitPillarsDraft() {
    if (!selectedProject) return;
    updateProject(selectedProject.id, {
      messagePillars: linesToList(pillarsDraft),
    });
    setSettingsDraft((prev) => ({
      ...prev,
      [selectedProject.id]: { ...(prev[selectedProject.id] ?? { audienceText: "", pillarsText: "" }), pillarsText: pillarsDraft },
    }));
  }

  // ── Client profile image ───────────────────────────────────────

  async function pickClientProfileImage(file: File) {
    if (!selectedClient) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateClient(selectedClient.id, { profileImageDataUrl: dataUrl });
    } catch {
      // ignore
    }
  }

  // ── Tree navigation ────────────────────────────────────────────

  function selectClient(clientId: string) {
    const client = data.clients.find((c) => c.id === clientId);
    if (!client) return;
    const proj = client.projects[0];
    const campaign = proj?.campaigns[0];
    setSelection({
      clientId,
      projectId: proj?.id ?? "",
      campaignId: campaign?.id ?? "",
    });
    setSelectionLevel("client");
    setExpandedClients((prev) => ({ ...prev, [clientId]: prev[clientId] !== false }));
  }

  function selectProject(clientId: string, projectId: string) {
    const project = data.clients
      .find((c) => c.id === clientId)
      ?.projects.find((p) => p.id === projectId);
    const campaign = project?.campaigns[0];
    setSelection({
      clientId,
      projectId,
      campaignId: campaign?.id ?? "",
    });
    setSelectionLevel("project");
    setExpandedProjects((prev) => ({ ...prev, [projectId]: prev[projectId] !== false }));
  }

  function selectCampaign(clientId: string, projectId: string, campaignId: string) {
    setSelection({ clientId, projectId, campaignId });
    setSelectionLevel("campaign");
  }

  function toggleClient(clientId: string) {
    setExpandedClients((prev) => ({
      ...prev,
      [clientId]: !(prev[clientId] ?? true),
    }));
  }

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !(prev[projectId] ?? true),
    }));
  }

  // ── Export ─────────────────────────────────────────────────────

  function exportCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, filename);
  }

  async function exportFramePng(): Promise<Blob | null> {
    const handle = canvasRef.current;
    if (!handle) return null;
    return handle.exportCanvas();
  }

  async function buildCampaignZip(
    client: Client,
    project: Project,
    campaign: Campaign,
    media: PreviewMedia
  ): Promise<Blob> {
    const zip = new JSZip();
    const folder = zip.folder(slugify(client.name))!
      .folder(slugify(project.name))!;

    // CSV
    const csv = generateProjectCsv(client, project);
    folder.file("campaigns.csv", csv);

    // Frame PNG (current canvas only)
    const png = await exportFramePng();
    if (png) {
      folder.file(`${slugify(campaign.name)}_frame.png`, png);
    }

    // Media file
    if (media.kind === "image") {
      const res = await fetch(media.url);
      const blob = await res.blob();
      folder.file(`${slugify(campaign.name)}_media.png`, blob);
    } else if (media.kind === "video") {
      const res = await fetch(media.url);
      const blob = await res.blob();
      folder.file(`${slugify(campaign.name)}_media.mp4`, blob);
    }

    return zip.generateAsync({ type: "blob" });
  }

  async function buildProjectZip(
    client: Client,
    project: Project
  ): Promise<Blob> {
    const zip = new JSZip();
    const folder = zip.folder(slugify(client.name))!
      .folder(slugify(project.name))!;

    const csv = generateProjectCsv(client, project);
    folder.file("campaigns.csv", csv);

    // Frame PNG for current campaign only
    const png = await exportFramePng();
    if (png && selectedCampaign) {
      folder.file(`${slugify(selectedCampaign.name)}_frame.png`, png);
    }

    // All campaign media
    for (const campaign of project.campaigns) {
      const m = campaignMedia[campaign.id];
      if (!m || m.kind === "none") continue;
      try {
        const res = await fetch(m.url);
        const blob = await res.blob();
        const ext = m.kind === "video" ? "mp4" : "png";
        folder.file(`${slugify(campaign.name)}_media.${ext}`, blob);
      } catch { /* skip */ }
    }

    return zip.generateAsync({ type: "blob" });
  }

  async function buildClientZip(client: Client): Promise<Blob> {
    const zip = new JSZip();
    const clientFolder = zip.folder(slugify(client.name))!;

    for (const project of client.projects) {
      const projFolder = clientFolder.folder(slugify(project.name))!;
      const csv = generateProjectCsv(client, project);
      projFolder.file("campaigns.csv", csv);

      for (const campaign of project.campaigns) {
        const m = campaignMedia[campaign.id];
        if (!m || m.kind === "none") continue;
        try {
          const res = await fetch(m.url);
          const blob = await res.blob();
          const ext = m.kind === "video" ? "mp4" : "png";
          projFolder.file(`${slugify(campaign.name)}_media.${ext}`, blob);
        } catch { /* skip */ }
      }
    }

    return zip.generateAsync({ type: "blob" });
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";

      if (e.key === "Escape") {
        setExportPanelOpen(false);
        cancelEdit();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        if (selection.clientId && selection.projectId) {
          addCampaign(selection.clientId, selection.projectId);
        }
      }

      if (!inInput && (e.key === "Backspace" || e.key === "Delete")) {
        if (selectionLevel === "campaign" && selection.campaignId) {
          deleteCampaign(selection.clientId, selection.projectId, selection.campaignId);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, selectionLevel]);

  // ── Search filter ──────────────────────────────────────────────

  const filteredData = useMemo((): AppData => {
    if (!sidebarSearch.trim()) return data;
    const q = sidebarSearch.toLowerCase();
    return {
      clients: data.clients
        .map((client) => {
          const clientMatch = client.name.toLowerCase().includes(q);
          const projects = client.projects
            .map((project) => {
              const projMatch = project.name.toLowerCase().includes(q);
              const campaigns = project.campaigns.filter(
                (c) => projMatch || clientMatch || c.name.toLowerCase().includes(q)
              );
              if (!clientMatch && !projMatch && campaigns.length === 0) return null;
              return { ...project, campaigns };
            })
            .filter(Boolean) as Project[];
          if (!clientMatch && projects.length === 0) return null;
          return { ...client, projects };
        })
        .filter(Boolean) as Client[],
    };
  }, [data, sidebarSearch]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER SECTIONS
  // ─────────────────────────────────────────────────────────────────────

  // ── Sidebar ───────────────────────────────────────────────────

  function renderSidebar() {
    const hasClients = data.clients.length > 0;
    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

    return (
      <>
        <div className="pane-header">
          {/* Workspace dropdown */}
          <div className="ws-dropdown-wrap">
            <button
              className="ws-dropdown-btn"
              onClick={() => setWsDropdownOpen((o) => !o)}
            >
              <IconWorkspace />
              <span className="ws-dropdown-name">{activeWs?.name ?? "Workspace"}</span>
              <IconChevronDown />
            </button>
            {wsDropdownOpen && (
              <div className="ws-dropdown-menu">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    className={`ws-dropdown-item${ws.id === activeWorkspaceId ? " is-active" : ""}`}
                    onClick={() => switchWorkspace(ws.id)}
                  >
                    <IconWorkspace />
                    <span>{ws.name}</span>
                    {ws.id === activeWorkspaceId && <span className="ws-check">✓</span>}
                  </button>
                ))}
                <div className="ws-dropdown-divider" />
                <button className="ws-dropdown-item ws-dropdown-new" onClick={createWorkspace}>
                  <IconPlus />
                  <span>New Workspace</span>
                </button>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-primary btn-sm"
            onClick={addClient}
            title="Add client"
          >
            <IconPlus /> Client
          </button>
        </div>

        {hasClients && (
          <div className="sidebar-search">
            <div className="sidebar-search-wrap">
              <span className="sidebar-search-icon">
                <IconSearch />
              </span>
              <input
                className="sidebar-search-input"
                placeholder="Search…"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="pane-body">
          {!hasClients ? (
            <div className="empty-state">
              <div className="empty-icon">
                <IconUser />
              </div>
              <h3>No clients yet</h3>
              <p>Add your first client to get started</p>
              <button className="btn btn-primary" onClick={addClient}>
                <IconPlus /> Add Client
              </button>
            </div>
          ) : (
            <div className="tree">
              {filteredData.clients.map((client) => {
                const isClientSelected = selection.clientId === client.id;
                const isClientExpanded = expandedClients[client.id] !== false;
                const isEditingClient =
                  editingName?.kind === "client" && editingName.clientId === client.id;

                return (
                  <div key={client.id} className="tree-section">
                    {/* Client row */}
                    <div
                      className={`tree-row${isClientSelected && selectionLevel === "client" ? " is-selected" : ""}`}
                      onClick={() => selectClient(client.id)}
                      onDoubleClick={() => beginClientEdit(client.id, client.name)}
                    >
                      <button
                        className="tree-toggle"
                        onClick={(e) => { e.stopPropagation(); toggleClient(client.id); }}
                        tabIndex={-1}
                      >
                        <IconChevron open={isClientExpanded} />
                      </button>

                      {client.profileImageDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={client.profileImageDataUrl}
                          alt=""
                          className="tree-avatar"
                        />
                      ) : (
                        <div className="tree-avatar">
                          <span style={{ fontSize: 9 }}>
                            {client.name.slice(0, 1).toUpperCase()}
                          </span>
                        </div>
                      )}

                      {isEditingClient ? (
                        <input
                          autoFocus
                          className="tree-inline-input"
                          value={editingName!.value}
                          onChange={(e) =>
                            setEditingName({ ...editingName!, value: e.target.value })
                          }
                          onBlur={commitEdit}
                          onKeyDown={onEditKey}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="tree-label tree-label-client">
                          {client.name}
                        </span>
                      )}

                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="row-act-btn"
                          title="Duplicate client"
                          onClick={() => duplicateClient(client.id)}
                        >
                          <IconDuplicate />
                        </button>
                        <button
                          className="row-act-btn is-danger"
                          title="Delete client"
                          onClick={() => deleteClient(client.id)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>

                    {/* Projects */}
                    {isClientExpanded && (
                      <>
                        {client.projects.map((project) => {
                          const isProjSelected =
                            isClientSelected && selection.projectId === project.id;
                          const isProjExpanded = expandedProjects[project.id] !== false;
                          const isEditingProj =
                            editingName?.kind === "project" &&
                            editingName.projectId === project.id;

                          return (
                            <div key={project.id}>
                              {/* Project row */}
                              <div
                                className={`tree-row tree-row-project${isProjSelected && selectionLevel === "project" ? " is-selected" : ""}`}
                                onClick={() => selectProject(client.id, project.id)}
                                onDoubleClick={() =>
                                  beginProjectEdit(client.id, project.id, project.name)
                                }
                              >
                                <button
                                  className="tree-toggle"
                                  onClick={(e) => { e.stopPropagation(); toggleProject(project.id); }}
                                  tabIndex={-1}
                                >
                                  <IconChevron open={isProjExpanded} />
                                </button>

                                {isEditingProj ? (
                                  <input
                                    autoFocus
                                    className="tree-inline-input"
                                    value={editingName!.value}
                                    onChange={(e) =>
                                      setEditingName({ ...editingName!, value: e.target.value })
                                    }
                                    onBlur={commitEdit}
                                    onKeyDown={onEditKey}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <span className="tree-label tree-label-project">
                                    {project.name}
                                  </span>
                                )}

                                <div
                                  className="row-actions"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    className="row-act-btn"
                                    title="Duplicate project"
                                    onClick={() => duplicateProject(client.id, project.id)}
                                  >
                                    <IconDuplicate />
                                  </button>
                                  <button
                                    className="row-act-btn is-danger"
                                    title="Delete project"
                                    onClick={() => deleteProject(client.id, project.id)}
                                  >
                                    <IconTrash />
                                  </button>
                                </div>
                              </div>

                              {/* Campaigns */}
                              {isProjExpanded && (
                                <>
                                  {project.campaigns.map((campaign) => {
                                    const isCampSelected =
                                      isProjSelected && selection.campaignId === campaign.id;
                                    const isEditingCamp =
                                      editingName?.kind === "campaign" &&
                                      editingName.campaignId === campaign.id;

                                    return (
                                      <div
                                        key={campaign.id}
                                        className={`tree-row tree-row-campaign${isCampSelected && selectionLevel === "campaign" ? " is-selected" : ""}`}
                                        onClick={() =>
                                          selectCampaign(client.id, project.id, campaign.id)
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
                                        <div
                                          className={`status-dot status-dot-${campaign.status}`}
                                        />

                                        {isEditingCamp ? (
                                          <input
                                            autoFocus
                                            className="tree-inline-input"
                                            value={editingName!.value}
                                            onChange={(e) =>
                                              setEditingName({ ...editingName!, value: e.target.value })
                                            }
                                            onBlur={commitEdit}
                                            onKeyDown={onEditKey}
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        ) : (
                                          <span className="tree-label tree-label-campaign">
                                            {campaign.name}
                                          </span>
                                        )}

                                        <span className="platform-pill">
                                          {campaign.platform
                                            .replace("Instagram ", "IG ")
                                            .replace("Facebook ", "FB ")
                                            .replace("LinkedIn ", "LI ")
                                            .replace("Feed", "")
                                            .trim()}
                                        </span>

                                        <div
                                          className="row-actions"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            className="row-act-btn"
                                            title="Duplicate ad"
                                            onClick={() =>
                                              duplicateCampaign(client.id, project.id, campaign.id)
                                            }
                                          >
                                            <IconDuplicate />
                                          </button>
                                          <button
                                            className="row-act-btn is-danger"
                                            title="Delete ad"
                                            onClick={() =>
                                              deleteCampaign(client.id, project.id, campaign.id)
                                            }
                                          >
                                            <IconTrash />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Add campaign */}
                                  <button
                                    className="tree-add-row tree-add-row-campaign"
                                    onClick={() => addCampaign(client.id, project.id)}
                                  >
                                    <IconPlus /> Add Creative
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}

                        {/* Add project */}
                        <button
                          className="tree-add-row tree-add-row-project"
                          onClick={() => addProject(client.id)}
                        >
                          <IconPlus /> Add Project
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Client View (middle pane) ──────────────────────────────────

  function renderClientView() {
    if (!selectedClient) return null;
    const client = selectedClient;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Profile row */}
        <div className="client-profile-row">
          <div className="client-avatar-lg">
            {client.profileImageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.profileImageDataUrl} alt="" />
            ) : (
              <IconUser />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              className="form-input"
              value={client.name}
              onChange={(e) => updateClient(client.id, { name: e.target.value })}
              placeholder="Client name"
              style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}
            />
            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickClientProfileImage(f);
                  }}
                />
                Upload Photo
              </label>
              {client.profileImageDataUrl && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => updateClient(client.id, { profileImageDataUrl: undefined })}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Projects grid */}
        <div
          className="context-header"
          style={{ padding: "16px 20px 12px" }}
        >
          <div className="context-header-eyebrow">Projects</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="context-header-title">
              {client.projects.length} project{client.projects.length !== 1 ? "s" : ""}
            </span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => addProject(client.id)}
            >
              <IconPlus /> Add
            </button>
          </div>
        </div>

        <div className="pane-body">
          <div className="cards-grid">
            {client.projects.map((project) => (
              <div
                key={project.id}
                className="card"
                onClick={() => selectProject(client.id, project.id)}
              >
                <div className="card-title">{project.name}</div>
                <div className="card-meta">
                  {project.campaigns.length} creative{project.campaigns.length !== 1 ? "s" : ""}
                </div>
                <div className="card-badges">
                  <span className={`badge badge-${project.objective.toLowerCase()}`}>
                    {project.objective}
                  </span>
                </div>
                <div className="card-hover-actions">
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={(e) => { e.stopPropagation(); duplicateProject(client.id, project.id); }}
                  >
                    Copy
                  </button>
                  <button
                    className="btn btn-danger btn-xs"
                    onClick={(e) => { e.stopPropagation(); deleteProject(client.id, project.id); }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {/* Add project card */}
            <button className="card card-add" onClick={() => addProject(client.id)}>
              <IconPlus />
              <span>New Project</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Project View (middle pane) ─────────────────────────────────

  function renderProjectView() {
    if (!selectedClient || !selectedProject) return null;
    const client = selectedClient;
    const project = selectedProject;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="context-header">
          <div className="context-header-eyebrow">{client.name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="context-header-title">{project.name}</span>
            <span className={`badge badge-${project.objective.toLowerCase()}`}>
              {project.objective}
            </span>
          </div>
          {project.primaryGoal && (
            <div className="context-header-meta">{project.primaryGoal}</div>
          )}
        </div>

        <div className="pane-body">
          {/* Quick settings block */}
          <div className="form-section" style={{ paddingBottom: 0 }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Objective</label>
                <div className="form-select-wrap">
                  <select
                    className="form-select"
                    value={project.objective}
                    onChange={(e) =>
                      updateProject(project.id, {
                        objective: e.target.value as CampaignObjective,
                      })
                    }
                  >
                    {OBJECTIVE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Default CTA</label>
                <div className="form-select-wrap">
                  <select
                    className="form-select"
                    value={project.defaultCta}
                    onChange={(e) =>
                      updateProject(project.id, {
                        defaultCta: e.target.value as CtaOption,
                      })
                    }
                  >
                    {CTA_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Primary Goal</label>
              <input
                className="form-input"
                value={project.primaryGoal}
                onChange={(e) =>
                  updateProject(project.id, { primaryGoal: e.target.value })
                }
                placeholder="e.g. Drive sign-ups for spring launch"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Audience Profiles</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={audienceDraft}
                onChange={(e) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    [project.id]: {
                      audienceText: e.target.value,
                      pillarsText: prev[project.id]?.pillarsText ?? pillarsDraft,
                    },
                  }))
                }
                onBlur={commitAudienceDraft}
                placeholder={"Young Professionals 25–34\nParents of Toddlers\nHealth-Conscious Millennials"}
              />
              <span className="form-hint">One audience per line</span>
            </div>
            <div className="form-group">
              <label className="form-label">Message Pillars</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={pillarsDraft}
                onChange={(e) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    [project.id]: {
                      audienceText: prev[project.id]?.audienceText ?? audienceDraft,
                      pillarsText: e.target.value,
                    },
                  }))
                }
                onBlur={commitPillarsDraft}
                placeholder={"Save time\nPremium quality\nSocial proof"}
              />
              <span className="form-hint">One pillar per line</span>
            </div>
            <div className="form-group">
              <label className="form-label">Brand Guardrails</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={project.guardrails}
                onChange={(e) =>
                  updateProject(project.id, { guardrails: e.target.value })
                }
                placeholder="e.g. No competitor mentions. Use inclusive language."
              />
            </div>
          </div>

          <div className="section-divider" style={{ margin: "0 0 4px" }} />

          {/* Creatives grid */}
          <div style={{ padding: "12px 20px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="section-title" style={{ padding: 0 }}>
                Creatives ({project.campaigns.length})
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => addCampaign(client.id, project.id)}
              >
                <IconPlus /> Add
              </button>
            </div>
          </div>

          <div className="cards-grid" style={{ paddingTop: 8 }}>
            {project.campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="card"
                onClick={() => selectCampaign(client.id, project.id, campaign.id)}
              >
                <div
                  style={{
                    height: 60,
                    borderRadius: "var(--r-sm)",
                    background: "linear-gradient(135deg, #1f2734, #3b4558)",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {campaignMedia[campaign.id]?.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(campaignMedia[campaign.id] as { url: string }).url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <IconImage />
                  )}
                </div>
                <div className="card-title">{campaign.name}</div>
                <div className="card-badges">
                  <span className="badge badge-platform">{campaign.platform}</span>
                  <span className={`badge badge-${campaign.status}`}>
                    {campaign.status}
                  </span>
                </div>
                <div className="card-hover-actions">
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateCampaign(client.id, project.id, campaign.id);
                    }}
                  >
                    Copy
                  </button>
                  <button
                    className="btn btn-danger btn-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCampaign(client.id, project.id, campaign.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            <button
              className="card card-add"
              onClick={() => addCampaign(client.id, project.id)}
            >
              <IconPlus />
              <span>New Creative</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Campaign Editor (middle pane) ─────────────────────────────

  function renderCampaignEditor() {
    if (!selectedCampaign || !selectedProject) {
      return (
        <div className="empty-state">
          <div className="empty-icon"><IconImage /></div>
          <h3>No creative selected</h3>
          <p>Select a creative from the sidebar</p>
        </div>
      );
    }

    const campaign = selectedCampaign;
    const project = selectedProject;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="pane-body">
          {/* Ad Editor (only mode now — campaign settings live on project view) */}
            <div className="form-section">
              <div className="form-group">
                <label className="form-label">Ad Name</label>
                <input
                  className="form-input"
                  value={campaign.name}
                  onChange={(e) => updateCampaign({ name: e.target.value })}
                  placeholder="Ad name"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Platform</label>
                  <div className="form-select-wrap">
                    <select
                      className="form-select"
                      value={campaign.platform}
                      onChange={(e) => {
                        const p = e.target.value as Platform;
                        updateCampaign({
                          platform: p,
                          mediaAspect: normalizeAspect(p, campaign.mediaAspect),
                        });
                      }}
                    >
                      {PLATFORM_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Ratio</label>
                  {isStoryPlatform(campaign.platform) ? (
                    <input
                      className="form-input"
                      value="9:16 (Story)"
                      readOnly
                    />
                  ) : (
                    <div className="form-select-wrap">
                      <select
                        className="form-select"
                        value={campaign.mediaAspect}
                        onChange={(e) =>
                          updateCampaign({ mediaAspect: e.target.value as MediaAspect })
                        }
                      >
                        {FEED_ASPECT_OPTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {audienceOptions.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Audience Profile</label>
                  <div className="form-select-wrap">
                    <select
                      className="form-select"
                      value={campaign.audienceProfile}
                      onChange={(e) =>
                        updateCampaign({ audienceProfile: e.target.value })
                      }
                    >
                      <option value="">— none —</option>
                      {audienceOptions.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {pillarOptions.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Message Pillar</label>
                  <div className="form-select-wrap">
                    <select
                      className="form-select"
                      value={campaign.messagePillar}
                      onChange={(e) =>
                        updateCampaign({ messagePillar: e.target.value })
                      }
                    >
                      <option value="">— none —</option>
                      {pillarOptions.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>Body Copy</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {copyFlash && <span className="copy-success">Copied!</span>}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const flash = () => { setCopyFlash(true); setTimeout(() => setCopyFlash(false), 1200); };
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(campaign.primaryText).then(flash).catch(() => {
                            try { document.execCommand("copy"); flash(); } catch { /* ignore */ }
                          });
                        } else {
                          try { document.execCommand("copy"); flash(); } catch { /* ignore */ }
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <textarea
                  className="form-textarea"
                  rows={6}
                  value={campaign.primaryText}
                  onChange={(e) => updateCampaign({ primaryText: e.target.value })}
                  placeholder="Write your ad body copy here…"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">CTA</label>
                  <div className="form-select-wrap">
                    <select
                      className="form-select"
                      value={campaign.cta}
                      onChange={(e) =>
                        updateCampaign({ cta: e.target.value as CtaOption })
                      }
                    >
                      {CTA_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">CTA Colour</label>
                  <div className="color-row">
                    <label className="color-swatch" title="Pick colour">
                      <input
                        type="color"
                        value={campaign.ctaBgColor}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateCampaign({
                            ctaBgColor: v,
                            ctaTextColor: contrastText(v),
                          });
                        }}
                      />
                    </label>
                    <input
                      className="form-input"
                      value={campaign.ctaBgColor}
                      onChange={(e) => {
                        const v = normalizeHex(e.target.value, campaign.ctaBgColor);
                        updateCampaign({ ctaBgColor: v, ctaTextColor: contrastText(v) });
                      }}
                      style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              {/* Status toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>
                    Status
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Mark when ready for review
                  </div>
                </div>
                <button
                  className={`btn btn-sm ${campaign.status === "ready" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() =>
                    updateCampaign({
                      status: campaign.status === "ready" ? "draft" : "ready",
                    })
                  }
                >
                  <div
                    className={`status-dot status-dot-${campaign.status === "ready" ? "ready" : "draft"}`}
                  />
                  {campaign.status === "ready" ? "Ready" : "Draft"}
                </button>
              </div>
            </div>
        </div>
      </div>
    );
  }

  // ── Preview Pane (right) ───────────────────────────────────────

  function renderPreview() {
    if (selectionLevel !== "campaign" || !selectedCampaign || !selectedClient) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <div className="pane-header">
            <span className="pane-header-title">Preview</span>
          </div>
          {renderInfoPane()}
        </div>
      );
    }

    const campaign = selectedCampaign;
    const client = selectedClient;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Toolbar */}
        <div className="preview-toolbar">
          <div className="toggle-pill">
            <button
              className={`toggle-pill-btn${feedMode === "frame" ? " is-active" : ""}`}
              onClick={() => setFeedMode("frame")}
            >
              Frame
            </button>
            <button
              className={`toggle-pill-btn${feedMode === "feed" ? " is-active" : ""}`}
              onClick={() => setFeedMode("feed")}
            >
              Feed
            </button>
          </div>
          <div className="zoom-controls">
            <button
              className="zoom-btn"
              onClick={() => {
                if (feedMode === "frame") setFrameZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(1)));
                else setFeedZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(1)));
              }}
            >
              −
            </button>
            <span className="zoom-label">
              {Math.round((feedMode === "frame" ? frameZoom : feedZoom) * 100)}%
            </span>
            <button
              className="zoom-btn"
              onClick={() => {
                if (feedMode === "frame") setFrameZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)));
                else setFeedZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)));
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Preview body — ref used for auto-zoom */}
        <div className="preview-body" ref={previewBodyRef}>
          {/* Feed view — routed by platform */}
          <div
            className="preview-scaled"
            style={{ display: feedMode === "feed" ? "flex" : "none", transform: `scale(${feedZoom * ZOOM_BASE})` }}
          >
            {campaign.platform === "Instagram Feed" && (
              <FeedScroll
                primaryText={campaign.primaryText}
                cta={campaign.cta}
                ctaBgColor={campaign.ctaBgColor}
                ctaTextColor={campaign.ctaTextColor}
                platform={campaign.platform}
                mediaAspect={campaign.mediaAspect}
                clientName={client.name}
                clientAvatarUrl={client.profileImageDataUrl}
                media={selectedMedia}
              />
            )}
            {campaign.platform === "Instagram Story" && (
              <StoryFeedScroll
                primaryText={campaign.primaryText}
                cta={campaign.cta}
                ctaBgColor={campaign.ctaBgColor}
                ctaTextColor={campaign.ctaTextColor}
                clientName={client.name}
                clientAvatarUrl={client.profileImageDataUrl}
                media={selectedMedia}
              />
            )}
            {campaign.platform === "Facebook Feed" && (
              <FacebookFeedScroll
                primaryText={campaign.primaryText}
                cta={campaign.cta}
                ctaBgColor={campaign.ctaBgColor}
                ctaTextColor={campaign.ctaTextColor}
                mediaAspect={campaign.mediaAspect}
                clientName={client.name}
                clientAvatarUrl={client.profileImageDataUrl}
                media={selectedMedia}
              />
            )}
            {campaign.platform === "TikTok" && (
              <TikTokFeedScroll
                primaryText={campaign.primaryText}
                cta={campaign.cta}
                ctaBgColor={campaign.ctaBgColor}
                ctaTextColor={campaign.ctaTextColor}
                clientName={client.name}
                clientAvatarUrl={client.profileImageDataUrl}
                media={selectedMedia}
              />
            )}
            {campaign.platform === "Instagram Reels" && (
              <ReelsFeedScroll
                primaryText={campaign.primaryText}
                cta={campaign.cta}
                ctaBgColor={campaign.ctaBgColor}
                ctaTextColor={campaign.ctaTextColor}
                clientName={client.name}
                clientAvatarUrl={client.profileImageDataUrl}
                media={selectedMedia}
              />
            )}
          </div>
          {/* Frame view — always mounted so canvasRef export works in both modes */}
          <div
            className="preview-scaled"
            style={{ display: feedMode === "frame" ? "flex" : "none", transform: `scale(${frameZoom * ZOOM_BASE})` }}
          >
            <PreviewCanvas
              ref={canvasRef}
              primaryText={campaign.primaryText}
              cta={campaign.cta}
              ctaBgColor={campaign.ctaBgColor}
              ctaTextColor={campaign.ctaTextColor}
              platform={campaign.platform}
              mediaAspect={campaign.mediaAspect}
              clientName={client.name}
              clientAvatarUrl={client.profileImageDataUrl}
              media={selectedMedia}
              onMediaChange={(m) => setCampaignMedia(campaign.id, m)}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Info Pane (right, when client/project selected) ─────────────

  function renderInfoPane() {
    if (!selectedClient) {
      return (
        <div className="empty-state">
          <div className="empty-icon"><IconFolder /></div>
          <h3>No selection</h3>
        </div>
      );
    }

    if (selectionLevel === "client") {
      const total = selectedClient.projects.reduce(
        (n, p) => n + p.campaigns.length,
        0
      );
      return (
        <div className="info-pane">
          <div className="info-stat-grid">
            <div className="info-stat-block">
              <div className="info-stat-value">{selectedClient.projects.length}</div>
              <div className="info-stat-label">Projects</div>
            </div>
            <div className="info-stat-block">
              <div className="info-stat-value">{total}</div>
              <div className="info-stat-label">Total Ads</div>
            </div>
          </div>
          <div className="info-stat-block">
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Projects
            </div>
            {selectedClient.projects.map((p) => (
              <div
                key={p.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}
              >
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{p.name}</span>
                <span className={`badge badge-${p.objective.toLowerCase()}`}>{p.objective}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (selectionLevel === "project" && selectedProject) {
      const ready = selectedProject.campaigns.filter((c) => c.status === "ready").length;
      return (
        <div className="info-pane">
          <div className="info-stat-grid">
            <div className="info-stat-block">
              <div className="info-stat-value">{selectedProject.campaigns.length}</div>
              <div className="info-stat-label">Creatives</div>
            </div>
            <div className="info-stat-block">
              <div className="info-stat-value">{ready}</div>
              <div className="info-stat-label">Ready</div>
            </div>
          </div>
          {selectedProject.audienceProfiles.length > 0 && (
            <div className="info-stat-block">
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Audiences
              </div>
              {selectedProject.audienceProfiles.map((a) => (
                <div key={a} style={{ fontSize: 13, color: "var(--ink-2)", padding: "3px 0" }}>
                  {a}
                </div>
              ))}
            </div>
          )}
          {selectedProject.messagePillars.length > 0 && (
            <div className="info-stat-block">
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Message Pillars
              </div>
              {selectedProject.messagePillars.map((p) => (
                <div key={p} style={{ fontSize: 13, color: "var(--ink-2)", padding: "3px 0" }}>
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  // ── Export Panel ───────────────────────────────────────────────

  function renderExportPanel() {
    if (!exportPanelOpen) return null;

    const hasMedia = selectedMedia.kind !== "none";
    const isImage = selectedMedia.kind === "image";
    const isVideo = selectedMedia.kind === "video";

    const close = () => setExportPanelOpen(false);

    let contextLabel = "Export";
    let title = "Export";

    if (selectionLevel === "client" && selectedClient) {
      contextLabel = "Client";
      title = selectedClient.name;
    } else if (selectionLevel === "project" && selectedProject) {
      contextLabel = "Project";
      title = selectedProject.name;
    } else if (selectedCampaign) {
      contextLabel = "Creative";
      title = selectedCampaign.name;
    }

    return (
      <>
        {/* Transparent backdrop to close on outside click */}
        <div className="export-backdrop" onClick={close} />
        <div className="export-panel">
          <div className="export-handle" />
          <div className="export-context-label">{contextLabel}</div>
          <div className="export-panel-title">{title}</div>

          {/* Creative-level options */}
          {selectionLevel === "campaign" && selectedCampaign && selectedProject && selectedClient && (
            <>
              <button
                className="export-option"
                onClick={async () => {
                  close();
                  const blob = await buildCampaignZip(selectedClient, selectedProject, selectedCampaign, selectedMedia);
                  triggerDownload(blob, `${slugify(selectedCampaign.name)}.zip`);
                }}
              >
                <div className="export-option-icon">📦</div>
                <div className="export-option-text">
                  <div className="export-option-label">Download as .zip</div>
                  <div className="export-option-desc">Frame PNG + media + CSV settings</div>
                </div>
              </button>

              <button
                className="export-option"
                onClick={async () => {
                  close();
                  const blob = await exportFramePng();
                  if (blob) triggerDownload(blob, `${slugify(selectedCampaign.name)}_frame.png`);
                }}
              >
                <div className="export-option-icon">🖼️</div>
                <div className="export-option-text">
                  <div className="export-option-label">Export frame as PNG</div>
                  <div className="export-option-desc">iPhone mockup with your ad</div>
                </div>
              </button>

              {isImage && (
                <button
                  className="export-option"
                  onClick={async () => {
                    close();
                    const res = await fetch(selectedMedia.url);
                    const blob = await res.blob();
                    triggerDownload(blob, `${slugify(selectedCampaign.name)}_image.png`);
                  }}
                >
                  <div className="export-option-icon">🖼</div>
                  <div className="export-option-text">
                    <div className="export-option-label">Export image as PNG</div>
                    <div className="export-option-desc">Original uploaded image</div>
                  </div>
                </button>
              )}

              {isVideo && (
                <button
                  className="export-option"
                  onClick={async () => {
                    close();
                    const res = await fetch(selectedMedia.url);
                    const blob = await res.blob();
                    triggerDownload(blob, `${slugify(selectedCampaign.name)}_video.mp4`);
                  }}
                >
                  <div className="export-option-icon">🎬</div>
                  <div className="export-option-text">
                    <div className="export-option-label">Export video</div>
                    <div className="export-option-desc">Original uploaded video (.mp4)</div>
                  </div>
                </button>
              )}

              <div className="export-divider" />

              <button
                className="export-option"
                onClick={() => {
                  close();
                  const csv = generateProjectCsv(selectedClient, selectedProject);
                  exportCsv(`${slugify(selectedProject.name)}_settings.csv`, csv);
                }}
              >
                <div className="export-option-icon">📋</div>
                <div className="export-option-text">
                  <div className="export-option-label">Export settings as CSV</div>
                  <div className="export-option-desc">Campaign metadata spreadsheet</div>
                </div>
              </button>
            </>
          )}

          {/* Project-level options */}
          {selectionLevel === "project" && selectedProject && selectedClient && (
            <>
              <button
                className="export-option"
                onClick={async () => {
                  close();
                  const blob = await buildProjectZip(selectedClient, selectedProject);
                  triggerDownload(blob, `${slugify(selectedProject.name)}.zip`);
                }}
              >
                <div className="export-option-icon">📦</div>
                <div className="export-option-text">
                  <div className="export-option-label">Download as .zip</div>
                  <div className="export-option-desc">All media + CSV for this project</div>
                </div>
              </button>

              <button
                className="export-option"
                onClick={async () => {
                  close();
                  const png = await exportFramePng();
                  if (png) triggerDownload(png, `${slugify(selectedProject.name)}_current_frame.png`);
                }}
              >
                <div className="export-option-icon">🖼️</div>
                <div className="export-option-text">
                  <div className="export-option-label">Export current frame as PNG</div>
                  <div className="export-option-desc">Currently previewed creative</div>
                </div>
              </button>

              <div className="export-divider" />

              <button
                className="export-option"
                onClick={() => {
                  close();
                  const csv = generateProjectCsv(selectedClient, selectedProject);
                  exportCsv(`${slugify(selectedProject.name)}_settings.csv`, csv);
                }}
              >
                <div className="export-option-icon">📋</div>
                <div className="export-option-text">
                  <div className="export-option-label">Export all settings as CSV</div>
                  <div className="export-option-desc">{selectedProject.campaigns.length} campaign rows</div>
                </div>
              </button>
            </>
          )}

          {/* Client-level options */}
          {selectionLevel === "client" && selectedClient && (
            <>
              <button
                className="export-option"
                onClick={async () => {
                  close();
                  const blob = await buildClientZip(selectedClient);
                  triggerDownload(blob, `${slugify(selectedClient.name)}_portfolio.zip`);
                }}
              >
                <div className="export-option-icon">📦</div>
                <div className="export-option-text">
                  <div className="export-option-label">Download full portfolio as .zip</div>
                  <div className="export-option-desc">
                    {selectedClient.projects.length} projects, all media + CSV
                  </div>
                </div>
              </button>

              <div className="export-divider" />

              {selectedClient.projects.map((p) => (
                <button
                  key={p.id}
                  className="export-option"
                  onClick={() => {
                    close();
                    const csv = generateProjectCsv(selectedClient, p);
                    exportCsv(`${slugify(p.name)}_settings.csv`, csv);
                  }}
                >
                  <div className="export-option-icon">📋</div>
                  <div className="export-option-text">
                    <div className="export-option-label">{p.name} — CSV</div>
                    <div className="export-option-desc">{p.campaigns.length} campaigns</div>
                  </div>
                </button>
              ))}
            </>
          )}

          <button className="export-close-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="app-root" data-theme={darkMode ? "dark" : undefined}>
      {/* Top bar */}
      <header className="top-bar">
        <span className="top-bar-brand">Socialize</span>
        <div className="top-bar-spacer" />
        <div className="top-bar-actions">
          <button
            className="icon-btn"
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? <IconSun /> : <IconMoon />}
          </button>
          <button
            className="btn btn-export"
            onClick={() => setExportPanelOpen(true)}
            disabled={!selectedClient}
          >
            Export ↑
          </button>
        </div>
      </header>

      {/* 3-pane layout */}
      <div className="app-shell">
        {/* Sidebar */}
        <aside
          className="pane pane-sidebar"
          style={{ width: panelWidths[0], minWidth: 200, maxWidth: 400 }}
        >
          {renderSidebar()}
        </aside>

        <ResizeHandle
          onDrag={(dx) =>
            setPanelWidths(([w0, w1]) => [
              Math.max(200, Math.min(400, w0 + dx)),
              w1,
            ])
          }
        />

        {/* Middle pane */}
        <main
          className="pane pane-editor"
          style={{
            width: panelWidths[1],
            minWidth: 320,
            maxWidth: 700,
            borderRight: "1px solid var(--line)",
          }}
        >
          {selectionLevel === "client"
            ? renderClientView()
            : selectionLevel === "project"
            ? renderProjectView()
            : renderCampaignEditor()}
        </main>

        <ResizeHandle
          onDrag={(dx) =>
            setPanelWidths(([w0, w1]) => [
              w0,
              Math.max(320, Math.min(700, w1 + dx)),
            ])
          }
        />

        {/* Preview pane */}
        <aside className="pane pane-preview">
          {renderPreview()}
        </aside>
      </div>

      {/* Export panel */}
      {renderExportPanel()}

      {/* Undo toast */}
      {pendingUndo && (
        <div className="toast">
          Deleted {pendingUndo.label}
          <button className="toast-undo" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
