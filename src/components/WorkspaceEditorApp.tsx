"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import type { Session, User } from "@supabase/supabase-js";
import {
  PreviewCanvas,
  type PreviewMedia,
  type PreviewCanvasHandle,
} from "@/components/PreviewCanvas";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  CloudWorkspaceConflictError,
  convertWorkspaceToOrganization,
  createOrganizationWorkspace,
  ensureProfileAndPersonalWorkspace,
  listAccessibleWorkspaces,
  loadWorkspaceData as loadCloudWorkspaceData,
  saveWorkspaceData,
  type CloudAppData,
} from "@/lib/cloud/workspaces";
import {
  acceptWorkspaceInvite,
  createWorkspaceInvite,
  listWorkspaceMembers,
  listMyPendingWorkspaceInvites,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
  type CloudIncomingWorkspaceInvite,
  type CloudWorkspaceMember,
  type CloudWorkspaceInvite,
} from "@/lib/cloud/invites";
import {
  clearCampaignEditorPresence,
  listCampaignEditorPresence,
  upsertCampaignEditorPresence,
  type CloudEditorPresence,
} from "@/lib/cloud/presence";
import {
  listIncomingCampaignHandoffRequests,
  requestCampaignHandoff,
  respondCampaignHandoffRequest,
  type CloudIncomingHandoffRequest,
} from "@/lib/cloud/handoff";
import {
  getLocalWorkspaceState,
  listLocalMediaAssetsForWorkspace,
  listLocalWorkspaceStates,
  putLocalMediaAsset,
  setLocalWorkspaceState,
  type LocalMediaAsset,
} from "@/lib/local/indexedDb";

// ─── Types ───────────────────────────────────────────────────────

type Platform =
  | "Instagram Feed"
  | "Instagram Story"
  | "Instagram Reels"
  | "Facebook Feed"
  | "TikTok";

type WorkspaceKind = "local" | "personal" | "organization";
type Workspace = { id: string; name: string; kind: WorkspaceKind; revision?: number };
type WorkspaceInviteRole = "member" | "owner";

type CtaOption = "Learn More" | "Shop Now" | "Sign Up" | "Download";
type MediaAspect = "1:1" | "3:4" | "9:16";
type CampaignObjective = "Awareness" | "Consideration" | "Conversion";
type CampaignStatus = "draft" | "ready" | "approved";
type EngagementPreset = "low" | "medium" | "high";
type SelectionLevel = "workspace" | "client" | "project" | "campaign";
type DragDropMode = "move" | "copy";
type DropInsertPosition = "before" | "after";
// EditorMode kept minimal — Campaign tab removed, only Ad editor remains

type Campaign = {
  id: string;
  name: string;
  platform: Platform;
  mediaAspect: MediaAspect;
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
  status: CampaignStatus;
  mediaStoragePath?: string;
  mediaKind?: "none" | "image" | "video";
  mediaMimeType?: string;
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
  isVerified: boolean;
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

type LocalDebugStats = {
  generatedAtIso: string;
  debugWorkspaceId: string;
  activeWorkspaceKind: WorkspaceKind;
  workspaceSnapshot: {
    exists: boolean;
    clients: number;
    projects: number;
    campaigns: number;
    bytes: number;
  };
  media: {
    count: number;
    images: number;
    videos: number;
    bytes: number;
  };
  localStorage: {
    uiBytes: number;
    legacyWorkspaceKeys: number;
    legacyWorkspaceBytes: number;
  };
};

type WorkspaceStorageEstimate = {
  usage: number;
  quota: number;
  free: number;
  usagePct: number;
  persisted: boolean | null;
  generatedAtIso: string;
};

type CampaignDragPayload = {
  sourceWorkspaceId: string;
  campaignId: string;
  sourceClientId: string;
  sourceProjectId: string;
};

type ProjectDragPayload = {
  sourceWorkspaceId: string;
  sourceClientId: string;
  sourceProjectId: string;
};

type CampaignDeepLinkTarget = {
  key: string;
  workspaceId: string;
  clientId: string;
  projectId: string;
  campaignId: string;
};

// ─── Constants ───────────────────────────────────────────────────

const LEGACY_STORAGE_KEY = "socialize.v1.workspace"; // for migration only
const UI_KEY = "socialize.v1.ui";
const WORKSPACES_KEY = "socialize.workspaces";
const ACTIVE_WS_KEY = "socialize.activeWs";
const WS_DATA_PREFIX = "socialize.ws.";
const CLOUD_ACTIVE_WS_KEY = "socialize.cloud.activeWs";
const CLOUD_IMPORT_DONE_PREFIX = "socialize.cloud.import.done.";
const LOCAL_WORKSPACE_ID = "ws_local";
const LOCAL_WS_NAME_KEY = "socialize.localWorkspaceName";
const DEFAULT_LOCAL_WORKSPACE_NAME = "Local Workspace";
const DEFAULT_MOCKUP_BACKDROP = "#ffffff";
const LOCAL_MEDIA_PATH_PREFIX = "local:";
const WS_PARAM_KEY = "ws";
const CLIENT_PARAM_KEY = "cl";
const PROJECT_PARAM_KEY = "pr";
const CAMPAIGN_PARAM_KEY = "ad";

const PLATFORM_OPTIONS: Platform[] = [
  "Instagram Feed",
  "Instagram Story",
  "Instagram Reels",
  "Facebook Feed",
];
const CTA_OPTIONS: CtaOption[] = [
  "Learn More",
  "Shop Now",
  "Sign Up",
  "Download",
];
const FACEBOOK_CTA_OPTIONS: string[] = [
  "Apply Now",
  "Book Now",
  "Buy Tickets",
  "Call Now",
  "Contact Us",
  "Donate Now",
  "Download",
  "Explore More",
  "Get Directions",
  "Get Offer",
  "Get Quote",
  "Get Showtimes",
  "Install Now",
  "Learn More",
  "Listen Now",
  "Open Instant Experience",
  "Order Now",
  "Play Game",
  "Request Time",
  "See Details",
  "See Menu",
  "Send Message",
  "Send WhatsApp Message",
  "Shop Now",
  "Sign Up",
  "Subscribe",
  "Use App",
  "Watch More",
];
const OBJECTIVE_OPTIONS: CampaignObjective[] = [
  "Awareness",
  "Consideration",
  "Conversion",
];
const FEED_ASPECT_OPTIONS: MediaAspect[] = ["1:1", "3:4"];
const DEFAULT_ENGAGEMENT_PRESET: EngagementPreset = "medium";
const ENGAGEMENT_DICE_ICON: Record<EngagementPreset, string> = {
  low: "/images/socialize/ui_dice_low.svg",
  medium: "/images/socialize/ui_dice_med.svg",
  high: "/images/socialize/ui_dice_high.svg",
};
const DEFAULT_CTA_BG = "#f2f2f2";
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

function stableSeedFromText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function randomEngagementSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] >>> 0) || 1;
  }
  return Math.max(1, Math.floor(Math.random() * 0xffffffff));
}

function nextEngagementPreset(preset: EngagementPreset): EngagementPreset {
  if (preset === "low") return "medium";
  if (preset === "medium") return "high";
  return "low";
}

function engagementPresetLabel(preset: EngagementPreset): string {
  if (preset === "low") return "Low";
  if (preset === "high") return "High";
  return "Medium";
}

function isStoryPlatform(p: Platform): boolean {
  return p === "Instagram Story" || p === "Instagram Reels";
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

function normalizeHexInput(v: string): string | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw;
  return `#${full.toLowerCase()}`;
}

function contrastText(bg: string): string {
  const hex = normalizeHex(bg, DEFAULT_CTA_BG);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b >= 155 ? "#111111" : "#ffffff";
}

function platformTreeBadge(platform: Platform): string {
  const labels: Record<Platform, string> = {
    "Instagram Feed": "IG",
    "Instagram Story": "IG STORY",
    "Instagram Reels": "IG REEL",
    "Facebook Feed": "FB",
    TikTok: "TIKTOK",
  };
  return labels[platform];
}

function normalizePlatform(v: unknown): Platform {
  if (
    v === "Instagram Feed" ||
    v === "Instagram Story" ||
    v === "Instagram Reels" ||
    v === "Facebook Feed"
  ) {
    return v;
  }
  if (v === "TikTok") return "Instagram Reels";
  return "Instagram Feed";
}

function normalizeObjective(v: unknown): CampaignObjective {
  if (v === "Consideration" || v === "Conversion") return v;
  return "Awareness";
}

function normalizeCampaignStatus(v: unknown): CampaignStatus {
  if (v === "ready" || v === "approved") return v;
  return "draft";
}

function nextCampaignStatus(status: CampaignStatus): CampaignStatus {
  if (status === "draft") return "ready";
  if (status === "ready") return "approved";
  return "draft";
}

function campaignStatusLabel(status: CampaignStatus): string {
  if (status === "ready") return "Ready";
  if (status === "approved") return "Approved";
  return "Draft";
}

function campaignStatusButtonClass(status: CampaignStatus): string {
  if (status === "approved") return "btn-primary";
  if (status === "ready") return "btn-success";
  return "btn-secondary";
}

function normalizeSelectionLevel(v: unknown): SelectionLevel {
  if (
    v === "workspace" ||
    v === "client" ||
    v === "project" ||
    v === "campaign"
  ) {
    return v;
  }
  return "campaign";
}

function normalizeWorkspaceName(
  value: string | undefined,
  fallback = DEFAULT_LOCAL_WORKSPACE_NAME
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

function loadLocalWorkspaceName(): string {
  if (typeof window === "undefined") return DEFAULT_LOCAL_WORKSPACE_NAME;
  try {
    const stored = localStorage.getItem(LOCAL_WS_NAME_KEY);
    return normalizeWorkspaceName(stored ?? undefined);
  } catch {
    return DEFAULT_LOCAL_WORKSPACE_NAME;
  }
}

function createLocalWorkspace(): Workspace {
  return {
    id: LOCAL_WORKSPACE_ID,
    name: loadLocalWorkspaceName(),
    kind: "local",
  };
}

function normalizeStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

function cleanSentenceFragment(v: string | undefined): string {
  if (!v) return "";
  return v
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");
}

function normalizeNameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueNameWithCopySuffix(name: string, existingNames: string[]): string {
  const trimmed = name.trim() || "Untitled";
  const existing = new Set(existingNames.map(normalizeNameKey));
  if (!existing.has(normalizeNameKey(trimmed))) return trimmed;

  let idx = 1;
  while (idx < 10000) {
    const candidate = idx === 1 ? `${trimmed} (Copy)` : `${trimmed} (Copy ${idx})`;
    if (!existing.has(normalizeNameKey(candidate))) return candidate;
    idx += 1;
  }
  return `${trimmed} ${Date.now()}`;
}

function objectiveAction(
  objective: CampaignObjective,
  cta: string
): string {
  if (objective === "Awareness") return "stop scrolling and watch";
  const normalizedCta = cleanSentenceFragment(cta).toLowerCase();
  return normalizedCta || "learn more";
}

function buildAdBrief(args: {
  audienceProfile: string;
  objective: CampaignObjective;
  primaryGoal: string;
  cta: string;
}): string {
  const audience = cleanSentenceFragment(args.audienceProfile).toLowerCase();
  const primaryGoal = cleanSentenceFragment(args.primaryGoal);
  const action = objectiveAction(args.objective, args.cta);

  if (primaryGoal && audience) {
    return `Write an ad that will ${primaryGoal}, and will make ${audience} want to ${action}.`;
  }
  if (primaryGoal) {
    return `Write an ad that will ${primaryGoal}, and will make someone want to ${action}.`;
  }
  if (audience) {
    return `Write an ad that makes ${audience} want to ${action}.`;
  }
  return `Write an ad that would make someone want to ${action}.`;
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
    facebookPageName: "",
    headline: "",
    url: "",
    cta: opts?.defaultCta ?? "Learn More",
    ctaVisible: true,
    audienceProfile: opts?.audienceProfile ?? "",
    messagePillar: opts?.messagePillar ?? "",
    ctaBgColor,
    ctaTextColor: contrastText(ctaBgColor),
    status: "draft",
    mediaStoragePath: "",
    mediaKind: "none",
    mediaMimeType: "",
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
  const platform = normalizePlatform((c as { platform?: unknown }).platform);
  const ctaBgColor = normalizeHex(
    (c as { ctaBgColor?: string }).ctaBgColor,
    DEFAULT_CTA_BG
  );
  const mediaMimeType =
    typeof (c as { mediaMimeType?: unknown }).mediaMimeType === "string"
      ? ((c as { mediaMimeType?: string }).mediaMimeType ?? "")
      : "";
  const mediaKind = inferMediaKind(
    (c as { mediaKind?: "none" | "image" | "video" }).mediaKind,
    mediaMimeType
  );
  return {
    ...c,
    platform,
    mediaAspect: normalizeAspect(platform, c.mediaAspect),
    cta:
      typeof (c as { cta?: unknown }).cta === "string"
        ? ((c as { cta?: string }).cta ?? "Learn More")
        : "Learn More",
    ctaVisible:
      typeof (c as { ctaVisible?: unknown }).ctaVisible === "boolean"
        ? ((c as { ctaVisible?: boolean }).ctaVisible ?? true)
        : true,
    audienceProfile:
      typeof (c as { audienceProfile?: unknown }).audienceProfile === "string"
        ? (c.audienceProfile ?? "")
        : "",
    messagePillar:
      typeof (c as { messagePillar?: unknown }).messagePillar === "string"
        ? (c.messagePillar ?? "")
        : "",
    facebookPageName:
      typeof (c as { facebookPageName?: unknown }).facebookPageName === "string"
        ? ((c as { facebookPageName?: string }).facebookPageName ?? "")
        : "",
    headline:
      typeof (c as { headline?: unknown }).headline === "string"
        ? ((c as { headline?: string }).headline ?? "")
        : "",
    url:
      typeof (c as { url?: unknown }).url === "string"
        ? ((c as { url?: string }).url ?? "")
        : "",
    status: normalizeCampaignStatus((c as { status?: unknown }).status),
    mediaStoragePath:
      typeof (c as { mediaStoragePath?: unknown }).mediaStoragePath === "string"
        ? ((c as { mediaStoragePath?: string }).mediaStoragePath ?? "")
        : "",
    mediaKind: mediaKind ?? "none",
    mediaMimeType,
    ctaBgColor,
    ctaTextColor: contrastText(ctaBgColor),
  };
}

function normalizeData(data: AppData): AppData {
  return {
    clients: data.clients.map((client) => ({
      ...client,
      isVerified:
        typeof (client as { isVerified?: unknown }).isVerified === "boolean"
          ? (client as { isVerified?: boolean }).isVerified ?? false
          : false,
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

function coerceSelection(data: AppData, selection: Selection): Selection {
  const fallback = defaultSelection(data);
  const client =
    data.clients.find((candidate) => candidate.id === selection.clientId) ??
    data.clients[0];
  if (!client) return fallback;
  const project =
    client.projects.find((candidate) => candidate.id === selection.projectId) ??
    client.projects[0];
  if (!project) {
    return {
      clientId: client.id,
      projectId: "",
      campaignId: "",
    };
  }
  const campaign =
    project.campaigns.find((candidate) => candidate.id === selection.campaignId) ??
    project.campaigns[0];
  return {
    clientId: client.id,
    projectId: project.id,
    campaignId: campaign?.id ?? "",
  };
}

function selectionLevelFromSelection(selection: Selection): SelectionLevel {
  if (selection.campaignId) return "campaign";
  if (selection.projectId) return "project";
  if (selection.clientId) return "client";
  return "workspace";
}

function cleanParam(value: string | null): string {
  return (value ?? "").trim();
}

function deepLinkKeyFromTarget(target: {
  workspaceId: string;
  clientId: string;
  projectId: string;
  campaignId: string;
}): string {
  return [target.workspaceId, target.clientId, target.projectId, target.campaignId].join("|");
}

function isLocalMediaStoragePath(path: string | undefined): path is string {
  return typeof path === "string" && path.startsWith(LOCAL_MEDIA_PATH_PREFIX);
}

function inferMediaKind(
  kind: Campaign["mediaKind"],
  mimeType?: string
): "image" | "video" | null {
  if (kind === "image" || kind === "video") return kind;
  if (typeof mimeType === "string") {
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("image/")) return "image";
  }
  return null;
}

async function sha256Hex(blob: Blob): Promise<string> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    return `${blob.size}-${Date.now()}`;
  }
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function localMediaStoragePathForFile(file: File): Promise<string> {
  const hash = await sha256Hex(file);
  return `${LOCAL_MEDIA_PATH_PREFIX}${hash}`;
}

async function localMediaStoragePathForBlob(blob: Blob): Promise<string> {
  const hash = await sha256Hex(blob);
  return `${LOCAL_MEDIA_PATH_PREFIX}${hash}`;
}

function fallbackLocalMediaStoragePath(): string {
  return `${LOCAL_MEDIA_PATH_PREFIX}fallback_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function isQuotaExceededStorageError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

function safeSetLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (isQuotaExceededStorageError(error)) {
      console.warn(`Local storage quota exceeded while writing "${key}".`);
      return false;
    }
    console.warn(`Unable to write "${key}" to local storage.`, error);
    return false;
  }
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
        safeSetLocalStorage(WS_DATA_PREFIX + defaultWs.id, legacy);
        safeSetLocalStorage(WORKSPACES_KEY, JSON.stringify([defaultWs]));
        safeSetLocalStorage(ACTIVE_WS_KEY, defaultWs.id);
        return [defaultWs];
      }
    }
    const defaultWs: Workspace = { id: "ws_default", name: "My Workspace", kind: "local" };
    safeSetLocalStorage(WORKSPACES_KEY, JSON.stringify([defaultWs]));
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

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePresenceLockErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to refresh editor presence.";
  const lower = message.toLowerCase();
  if (
    (lower.includes("editor_presence") && lower.includes("does not exist")) ||
    lower.includes("upsert_editor_presence") ||
    lower.includes("list_editor_presence")
  ) {
    return "Presence lock migration is missing. Run 20260327_editor_presence_lock.sql.";
  }
  return message;
}

function normalizeHandoffErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to process handoff request.";
  const lower = message.toLowerCase();
  if (
    (lower.includes("editor_handoff_requests") && lower.includes("does not exist")) ||
    lower.includes("create_editor_handoff_request") ||
    lower.includes("list_incoming_editor_handoff_requests") ||
    lower.includes("respond_editor_handoff_request")
  ) {
    return "Handoff migration is missing. Run 20260328_editor_handoff_requests.sql.";
  }
  return message;
}

function presenceLabelFromIdentity(identity: {
  displayName?: string | null;
  email?: string | null;
}): string {
  if (typeof identity.displayName === "string" && identity.displayName.trim()) {
    return identity.displayName.trim();
  }
  const email = identity.email;
  if (typeof email !== "string") return "Another editor";
  const normalized = email.trim();
  if (!normalized) return "Another editor";
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0) return normalized;
  return normalized.slice(0, atIndex);
}

function defaultProfileDisplayName(email: string | null | undefined): string {
  if (!email) return "User";
  const atIndex = email.indexOf("@");
  const localPart = (atIndex > 0 ? email.slice(0, atIndex) : email).trim();
  return localPart || "User";
}

function normalizeProfileSettingsErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to load profile settings.";
  const lower = message.toLowerCase();
  if (
    (lower.includes("profiles") && lower.includes("display_name")) ||
    (lower.includes("profiles") && lower.includes("profile_image_data_url")) ||
    (lower.includes("profiles") && lower.includes("status_text"))
  ) {
    return "Profile settings migration is missing. Run 20260327_profile_settings_fields.sql and 20260328_profile_status_field.sql, then refresh.";
  }
  return message;
}

function loadWorkspaceDataFromLocalStorage(
  wsId: string
): { data: AppData; selection: Selection; level: SelectionLevel } {
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
    const level = normalizeSelectionLevel(parsed.level);
    return { data, selection: sel, level };
  } catch {
    const data = emptyWorkspace();
    return { data, selection: defaultSelection(data), level: "campaign" };
  }
}

type WorkspaceStateSnapshot = {
  data: AppData;
  selection: Selection;
  level: SelectionLevel;
};

function snapshotHasData(snapshot: WorkspaceStateSnapshot): boolean {
  return snapshot.data.clients.length > 0;
}

function cleanupLegacyWorkspaceStorage() {
  if (typeof window === "undefined") return;
  try {
    const wsListRaw = localStorage.getItem(WORKSPACES_KEY);
    const wsList = wsListRaw ? (JSON.parse(wsListRaw) as Workspace[]) : [];
    for (const ws of wsList) {
      localStorage.removeItem(WS_DATA_PREFIX + ws.id);
    }
    localStorage.removeItem(WS_DATA_PREFIX + LOCAL_WORKSPACE_ID);
    localStorage.removeItem(WS_DATA_PREFIX + "ws_default");
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // noop
  }
}

async function loadPrimaryLocalWorkspaceState(): Promise<WorkspaceStateSnapshot> {
  if (typeof window === "undefined") {
    const data = emptyWorkspace();
    return { data, selection: defaultSelection(data), level: "campaign" };
  }

  const indexed = await getLocalWorkspaceState<WorkspaceStateSnapshot>(LOCAL_WORKSPACE_ID);
  if (indexed) {
    const normalized = {
      data: normalizeData(indexed.data),
      selection: indexed.selection ?? defaultSelection(normalizeData(indexed.data)),
      level: normalizeSelectionLevel(indexed.level),
    } satisfies WorkspaceStateSnapshot;
    if (snapshotHasData(normalized)) {
      return normalized;
    }
  }

  const local = loadWorkspaceDataFromLocalStorage(LOCAL_WORKSPACE_ID);
  if (snapshotHasData(local)) {
    void setLocalWorkspaceState(LOCAL_WORKSPACE_ID, local);
    cleanupLegacyWorkspaceStorage();
    return local;
  }

  const oldDefault = loadWorkspaceDataFromLocalStorage("ws_default");
  if (snapshotHasData(oldDefault)) {
    void setLocalWorkspaceState(LOCAL_WORKSPACE_ID, oldDefault);
    cleanupLegacyWorkspaceStorage();
    return oldDefault;
  }

  const wsList = loadWorkspaceList();
  const oldActive = loadActiveWsId(wsList);
  const migrated = loadWorkspaceDataFromLocalStorage(oldActive);
  if (snapshotHasData(migrated)) {
    void setLocalWorkspaceState(LOCAL_WORKSPACE_ID, migrated);
    cleanupLegacyWorkspaceStorage();
    return migrated;
  }

  return local;
}

async function getLegacyWorkspaceForImport(): Promise<AppData | null> {
  if (typeof window === "undefined") return null;

  const indexedLocal = await getLocalWorkspaceState<WorkspaceStateSnapshot>(LOCAL_WORKSPACE_ID);
  if (indexedLocal?.data?.clients?.length) {
    return normalizeData(indexedLocal.data);
  }

  const indexedStates = await listLocalWorkspaceStates<WorkspaceStateSnapshot>();
  for (const state of indexedStates) {
    if (state.state?.data?.clients?.length) {
      return normalizeData(state.state.data);
    }
  }

  try {
    const localRaw = localStorage.getItem(WS_DATA_PREFIX + LOCAL_WORKSPACE_ID);
    if (localRaw) {
      const parsed = JSON.parse(localRaw) as { data?: AppData };
      if (parsed?.data?.clients?.length) return normalizeData(parsed.data);
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as { data?: AppData };
      if (parsed?.data?.clients) return normalizeData(parsed.data);
    }
    const wsListRaw = localStorage.getItem(WORKSPACES_KEY);
    const wsList = wsListRaw ? (JSON.parse(wsListRaw) as Workspace[]) : [];
    for (const ws of wsList) {
      const raw = localStorage.getItem(WS_DATA_PREFIX + ws.id);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { data?: AppData };
      if (parsed?.data?.clients && parsed.data.clients.length > 0) {
        return normalizeData(parsed.data);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function mergeImportedData(current: AppData, incoming: AppData): AppData {
  const existingClientIds = new Set(current.clients.map((c) => c.id));
  const dedupedImported = incoming.clients.map((client) => {
    if (!existingClientIds.has(client.id)) return client;
    const clientId = newId("cl");
    return {
      ...client,
      id: clientId,
      projects: client.projects.map((project) => {
        const projectId = newId("prj");
        return {
          ...project,
          id: projectId,
          campaigns: project.campaigns.map((campaign) => ({
            ...campaign,
            id: newId("cmp"),
          })),
        };
      }),
    };
  });
  return { clients: [...current.clients, ...dedupedImported] };
}

type UiPrefs = {
  panelWidths: [number, number];
  darkMode: boolean;
  showIgFeedOverlay: boolean;
  igFeedOverlayOpacity: number;
  igFeedOverlayScale: number;
  igFeedOverlayOffsetX: number;
  igFeedOverlayOffsetY: number;
  mockupBackdropColor: string;
  transparentPngExport: boolean;
  expandedWorkspaces: Record<string, boolean>;
  expandedClients: Record<string, boolean>;
  expandedProjects: Record<string, boolean>;
  storyCtaOffsets: Record<string, { x: number; y: number }>;
  engagementSettings: Record<string, { preset: EngagementPreset; seed: number }>;
};

function normalizeBooleanRecord(
  value: unknown
): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>(
    (acc, [key, v]) => {
      if (typeof v === "boolean") acc[key] = v;
      return acc;
    },
    {}
  );
}

function normalizeStoryCtaOffsets(
  value: unknown
): Record<string, { x: number; y: number }> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, { x: number; y: number }>
  >((acc, [key, entry]) => {
    if (!entry || typeof entry !== "object") return acc;
    const x = (entry as { x?: unknown }).x;
    const y = (entry as { y?: unknown }).y;
    if (typeof x !== "number" || !Number.isFinite(x)) return acc;
    if (typeof y !== "number" || !Number.isFinite(y)) return acc;
    acc[key] = { x: Math.round(x), y: Math.round(y) };
    return acc;
  }, {});
}

function normalizeEngagementSettings(
  value: unknown
): Record<string, { preset: EngagementPreset; seed: number }> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, { preset: EngagementPreset; seed: number }>
  >((acc, [key, entry]) => {
    if (!entry || typeof entry !== "object") return acc;
    const preset = (entry as { preset?: unknown }).preset;
    const seed = (entry as { seed?: unknown }).seed;
    if (preset !== "low" && preset !== "medium" && preset !== "high") return acc;
    if (typeof seed !== "number" || !Number.isFinite(seed)) return acc;
    acc[key] = { preset, seed: Math.max(1, Math.floor(seed)) };
    return acc;
  }, {});
}

function loadUiPrefs(): UiPrefs {
  const fallback: UiPrefs = {
    panelWidths: [260, 420],
    darkMode: false,
    showIgFeedOverlay: false,
    igFeedOverlayOpacity: 0.4,
    igFeedOverlayScale: 1,
    igFeedOverlayOffsetX: 0,
    igFeedOverlayOffsetY: 0,
    mockupBackdropColor: DEFAULT_MOCKUP_BACKDROP,
    transparentPngExport: false,
    expandedWorkspaces: {},
    expandedClients: {},
    expandedProjects: {},
    storyCtaOffsets: {},
    engagementSettings: {},
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      panelWidths?: [number, number];
      darkMode?: boolean;
      showIgFeedOverlay?: boolean;
      igFeedOverlayOpacity?: number;
      igFeedOverlayScale?: number;
      igFeedOverlayOffsetX?: number;
      igFeedOverlayOffsetY?: number;
      mockupBackdropColor?: string;
      transparentPngExport?: boolean;
      expandedWorkspaces?: Record<string, boolean>;
      expandedClients?: Record<string, boolean>;
      expandedProjects?: Record<string, boolean>;
      storyCtaOffsets?: Record<string, { x: number; y: number }>;
      engagementSettings?: Record<
        string,
        { preset: EngagementPreset; seed: number }
      >;
    };
    const opacity =
      typeof parsed.igFeedOverlayOpacity === "number"
        ? Math.max(0, Math.min(1, parsed.igFeedOverlayOpacity))
        : fallback.igFeedOverlayOpacity;
    const scale =
      typeof parsed.igFeedOverlayScale === "number"
        ? Math.max(0.4, Math.min(2.5, parsed.igFeedOverlayScale))
        : fallback.igFeedOverlayScale;
    const offsetX =
      typeof parsed.igFeedOverlayOffsetX === "number"
        ? Math.max(-220, Math.min(220, parsed.igFeedOverlayOffsetX))
        : fallback.igFeedOverlayOffsetX;
    const offsetY =
      typeof parsed.igFeedOverlayOffsetY === "number"
        ? Math.max(-360, Math.min(360, parsed.igFeedOverlayOffsetY))
        : fallback.igFeedOverlayOffsetY;
    return {
      panelWidths: Array.isArray(parsed.panelWidths) ? parsed.panelWidths : [260, 420],
      darkMode: typeof parsed.darkMode === "boolean" ? parsed.darkMode : false,
      showIgFeedOverlay:
        typeof parsed.showIgFeedOverlay === "boolean"
          ? parsed.showIgFeedOverlay
          : fallback.showIgFeedOverlay,
      igFeedOverlayOpacity: opacity,
      igFeedOverlayScale: scale,
      igFeedOverlayOffsetX: offsetX,
      igFeedOverlayOffsetY: offsetY,
      mockupBackdropColor:
        typeof parsed.mockupBackdropColor === "string"
          ? normalizeHex(parsed.mockupBackdropColor, DEFAULT_MOCKUP_BACKDROP)
          : fallback.mockupBackdropColor,
      transparentPngExport:
        typeof parsed.transparentPngExport === "boolean"
          ? parsed.transparentPngExport
          : fallback.transparentPngExport,
      expandedWorkspaces: normalizeBooleanRecord(parsed.expandedWorkspaces),
      expandedClients: normalizeBooleanRecord(parsed.expandedClients),
      expandedProjects: normalizeBooleanRecord(parsed.expandedProjects),
      storyCtaOffsets: normalizeStoryCtaOffsets(parsed.storyCtaOffsets),
      engagementSettings: normalizeEngagementSettings(parsed.engagementSettings),
    };
  } catch {
    return fallback;
  }
}

function formatCsvCell(v: string): string {
  const n = v.replace(/\r?\n/g, " ");
  return /[",]/.test(n) ? `"${n.replaceAll('"', '""')}"` : n;
}

function measureUtf8Bytes(value: string): number {
  if (!value) return 0;
  return new TextEncoder().encode(value).length;
}

function formatBytes(bytes: number): string {
  const abs = Math.max(0, bytes);
  if (abs < 1024) return `${abs} B`;
  if (abs < 1024 * 1024) return `${(abs / 1024).toFixed(1)} KB`;
  return `${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

function countWorkspaceEntities(data: AppData): {
  clients: number;
  projects: number;
  campaigns: number;
} {
  const clients = data.clients.length;
  let projects = 0;
  let campaigns = 0;
  for (const client of data.clients) {
    projects += client.projects.length;
    for (const project of client.projects) {
      campaigns += project.campaigns.length;
    }
  }
  return { clients, projects, campaigns };
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
    "facebook_page_name",
    "headline",
    "url",
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
      formatCsvCell(c.facebookPageName),
      formatCsvCell(c.headline),
      formatCsvCell(c.url),
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
      width="11"
      height="11"
      viewBox="0 0 32 32"
      fill="none"
      style={{
        transition: "transform 150ms ease",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
      }}
    >
      <path
        d="M11.9,25c0-.3,0-.5.3-.7l8.3-8.3L12.1,7.7c-.6-.5-.3-1.5.4-1.7.3,0,.7,0,1,.3l9,9c.4.4.4,1,0,1.4l-9,9c-.5.5-1.5.3-1.7-.4v-.3h0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconWorkspace({ kind }: { kind: WorkspaceKind }) {
  const iconSrc = kind === "local" ? "/images/socialize/ui_write.svg" : "/images/socialize/ui_org.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={iconSrc}
      alt=""
      aria-hidden="true"
      className="tree-node-icon tree-node-icon-workspace"
    />
  );
}

function IconTreeProject() {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/images/socialize/ui_folder.svg"
      alt=""
      aria-hidden="true"
      className="tree-node-icon tree-node-icon-project"
    />
  );
}

function IconTreeAd() {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/images/socialize/ui_doc.svg"
      alt=""
      aria-hidden="true"
      className="tree-node-icon tree-node-icon-campaign"
    />
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

const DEFAULT_WS: Workspace = {
  id: LOCAL_WORKSPACE_ID,
  name: DEFAULT_LOCAL_WORKSPACE_NAME,
  kind: "local",
};
const DEFAULT_EMPTY_DATA = emptyWorkspace();
const DEFAULT_SELECTION: Selection = { clientId: "", projectId: "", campaignId: "" };

export default function WorkspaceEditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceLocalMode = searchParams.get("mode") === "local";
  const cloudEnabled = isSupabaseConfigured() && !forceLocalMode;
  const supabase = useMemo(
    () => (cloudEnabled ? getBrowserSupabaseClient() : null),
    [cloudEnabled]
  );
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [importPending, setImportPending] = useState(false);

  // Workspace — start with static defaults to match SSR, then load from localStorage after mount
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_WS]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(DEFAULT_WS.id);

  const [data, setData] = useState<AppData>(DEFAULT_EMPTY_DATA);
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [selectionLevel, setSelectionLevel] = useState<SelectionLevel>("campaign");
  const [storageReady, setStorageReady] = useState(false);

  // Panel widths: sidebar, editor (preview fills remaining)
  const [panelWidths, setPanelWidths] = useState<[number, number]>([260, 420]);

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);
  const [optionCopyMode, setOptionCopyMode] = useState(false);

  // Load UI prefs after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    const ui = loadUiPrefs();
    setPanelWidths(ui.panelWidths);
    setDarkMode(ui.darkMode);
    setShowIgFeedOverlay(ui.showIgFeedOverlay);
    setIgFeedOverlayOpacity(ui.igFeedOverlayOpacity);
    setIgFeedOverlayScale(ui.igFeedOverlayScale);
    setIgFeedOverlayOffsetX(ui.igFeedOverlayOffsetX);
    setIgFeedOverlayOffsetY(ui.igFeedOverlayOffsetY);
    setMockupBackdropColor(ui.mockupBackdropColor);
    setTransparentPngExport(ui.transparentPngExport);
    setExpandedWorkspaces(ui.expandedWorkspaces);
    setExpandedClients(ui.expandedClients);
    setExpandedProjects(ui.expandedProjects);
    setStoryCtaOffsets(ui.storyCtaOffsets);
    setEngagementSettings(ui.engagementSettings);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("storage" in navigator)) return;
    if (typeof navigator.storage.persist !== "function") return;
    void navigator.storage.persist().catch(() => {
      // noop
    });
  }, []);

  // Local-only bootstrap
  useEffect(() => {
    if (cloudEnabled) return;
    let cancelled = false;
    void (async () => {
      const localWorkspaceEntry = createLocalWorkspace();
      const wsData = await loadPrimaryLocalWorkspaceState();
      if (cancelled) return;
      setWorkspaceSyncConflicts({});
      setWorkspaces([localWorkspaceEntry]);
      setActiveWorkspaceId(localWorkspaceEntry.id);
      hydratedWorkspaceRef.current = localWorkspaceEntry.id;
      setData(wsData.data);
      setSelection(wsData.selection);
      setSelectionLevel(wsData.level);
      await hydrateLocalMediaForWorkspace(localWorkspaceEntry.id, wsData.data);
      setStorageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase auth bootstrap
  useEffect(() => {
    if (!cloudEnabled) return;
    if (!supabase) return;

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthUser(nextSession?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [cloudEnabled, supabase]);

  useEffect(() => {
    if (!cloudEnabled) return;
    if (!authReady) return;
    if (!supabase) return;
    if (authUser) return;
    router.replace("/login");
  }, [cloudEnabled, authReady, supabase, authUser, router]);

  // Cloud workspace bootstrap for authenticated user
  useEffect(() => {
    if (!cloudEnabled) return;
    if (!supabase) return;
    if (!authReady) return;

    if (!authUser) {
      const localWorkspaceEntry = createLocalWorkspace();
      setStorageReady(false);
      setCloudHydrated(false);
      setShowImportPrompt(false);
      setShowUserSettings(false);
      setWorkspaceSyncConflicts({});
      cloudWorkspaceDataSignatureRef.current = {};
      setWorkspaces([localWorkspaceEntry]);
      setActiveWorkspaceId(localWorkspaceEntry.id);
      setData(DEFAULT_EMPTY_DATA);
      replaceCampaignMedia({});
      setSelection(DEFAULT_SELECTION);
      setSelectionLevel("campaign");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        cloudWorkspaceDataSignatureRef.current = {};
        const localWorkspaceEntry = createLocalWorkspace();
        const localState = await loadPrimaryLocalWorkspaceState();
        const personal = await ensureProfileAndPersonalWorkspace(supabase, authUser);
        const wsList = await listAccessibleWorkspaces(supabase, authUser.id);
        const cloudWorkspaces =
          wsList.length > 0
            ? wsList
            : [personal];
        const resolvedList: Workspace[] = [
          localWorkspaceEntry,
          ...cloudWorkspaces
            .filter((w) => w.id !== localWorkspaceEntry.id)
            .map((w) => ({
              id: w.id,
              name: w.name,
              kind: w.kind,
              revision: w.revision,
            })),
        ];

        const storedActive =
          typeof window !== "undefined"
            ? localStorage.getItem(CLOUD_ACTIVE_WS_KEY)
            : null;
        const storedWorkspaceId =
          (storedActive &&
            resolvedList.find(
              (workspace) => workspace.id === storedActive && workspace.kind !== "personal"
            )?.id) ||
          "";
        const defaultCloudWorkspaceId = resolvedList.find(
          (workspace) => workspace.kind === "organization"
        )?.id;
        const wsId = storedWorkspaceId || defaultCloudWorkspaceId || localWorkspaceEntry.id;

        if (cancelled) return;
        setWorkspaces(resolvedList);
        setActiveWorkspaceId(wsId);
        hydratedWorkspaceRef.current = wsId;
        if (wsId === localWorkspaceEntry.id) {
          setData(localState.data);
          setSelection(localState.selection);
          setSelectionLevel(localState.level);
          await hydrateLocalMediaForWorkspace(wsId, localState.data);
          setStorageReady(true);
          setCloudHydrated(true);
        } else {
          const cloudData = (await loadCloudWorkspaceData(
            supabase,
            wsId
          )) as CloudAppData;
          const normalized = normalizeData(cloudData as AppData);
          const sel = defaultSelection(normalized);
          if (cancelled) return;
          setCloudDataSignature(wsId, normalized);
          setData(normalized);
          setSelection(sel);
          setSelectionLevel("campaign");
          setStorageReady(true);
          setCloudHydrated(true);
          void hydrateSignedMediaForWorkspace(wsId, normalized).catch((error) => {
            console.error("Failed to hydrate signed media", error);
          });
        }

        if (typeof window !== "undefined") {
          const importKey = CLOUD_IMPORT_DONE_PREFIX + authUser.id;
          if (!localStorage.getItem(importKey)) {
            const legacy = await getLegacyWorkspaceForImport();
            if (legacy?.clients?.length) {
              setShowImportPrompt(true);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load cloud workspace", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, authUser, cloudEnabled, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Export panel
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [isVideoRecordingExport, setIsVideoRecordingExport] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugPanelLoading, setDebugPanelLoading] = useState(false);
  const [debugPanelError, setDebugPanelError] = useState<string | null>(null);
  const [localDebugStats, setLocalDebugStats] = useState<LocalDebugStats | null>(null);
  const [workspaceStorageEstimate, setWorkspaceStorageEstimate] =
    useState<WorkspaceStorageEstimate | null>(null);
  const [workspaceStorageLoading, setWorkspaceStorageLoading] = useState(false);
  const [workspaceStorageError, setWorkspaceStorageError] = useState<string | null>(null);
  const [workspaceInviteEmailDraft, setWorkspaceInviteEmailDraft] = useState("");
  const [workspaceInviteRoleDraft, setWorkspaceInviteRoleDraft] =
    useState<WorkspaceInviteRole>("member");
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [profileDisplayNameSaved, setProfileDisplayNameSaved] = useState("");
  const [profileDisplayNameDraft, setProfileDisplayNameDraft] = useState("");
  const [profileStatusSaved, setProfileStatusSaved] = useState("");
  const [profileStatusDraft, setProfileStatusDraft] = useState("");
  const [profileImageDataUrlSaved, setProfileImageDataUrlSaved] = useState<string | null>(null);
  const [profileImageDataUrl, setProfileImageDataUrl] = useState<string | null>(null);
  const [profileSettingsLoading, setProfileSettingsLoading] = useState(false);
  const [profileSettingsSaving, setProfileSettingsSaving] = useState(false);
  const [profileSettingsError, setProfileSettingsError] = useState<string | null>(null);
  const [workspaceInvitesByWorkspace, setWorkspaceInvitesByWorkspace] = useState<
    Record<string, CloudWorkspaceInvite[]>
  >({});
  const [workspaceMembersByWorkspace, setWorkspaceMembersByWorkspace] = useState<
    Record<string, CloudWorkspaceMember[]>
  >({});
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false);
  const [workspaceMembersError, setWorkspaceMembersError] = useState<string | null>(null);
  const [workspaceInvitesLoading, setWorkspaceInvitesLoading] = useState(false);
  const [workspaceInvitesSaving, setWorkspaceInvitesSaving] = useState(false);
  const [workspaceInviteUpgradeLoading, setWorkspaceInviteUpgradeLoading] =
    useState(false);
  const [workspaceInvitesError, setWorkspaceInvitesError] = useState<string | null>(null);
  const [canCreateSharedWorkspace, setCanCreateSharedWorkspace] = useState(false);
  const [incomingWorkspaceInvites, setIncomingWorkspaceInvites] = useState<
    CloudIncomingWorkspaceInvite[]
  >([]);
  const [incomingWorkspaceInvitesLoading, setIncomingWorkspaceInvitesLoading] =
    useState(false);
  const [incomingWorkspaceInvitesError, setIncomingWorkspaceInvitesError] = useState<
    string | null
  >(null);
  const [workspaceSyncConflicts, setWorkspaceSyncConflicts] = useState<
    Record<string, string>
  >({});
  const [activeCampaignPresence, setActiveCampaignPresence] = useState<
    CloudEditorPresence[]
  >([]);
  const [, setActiveCampaignPresenceLoading] = useState(false);
  const [activeCampaignPresenceError, setActiveCampaignPresenceError] = useState<
    string | null
  >(null);
  const [incomingHandoffRequests, setIncomingHandoffRequests] = useState<
    CloudIncomingHandoffRequest[]
  >([]);
  const [incomingHandoffRequestsError, setIncomingHandoffRequestsError] = useState<
    string | null
  >(null);
  const [requestHandoffPending, setRequestHandoffPending] = useState(false);
  const [requestHandoffNotice, setRequestHandoffNotice] = useState<string | null>(null);
  const [respondHandoffPendingId, setRespondHandoffPendingId] = useState<number | null>(
    null
  );
  const [activeCampaignHandoffReleased, setActiveCampaignHandoffReleased] =
    useState(false);

  // Undo
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // Preview
  const [zoom, setZoom] = useState(1);
  const [showIgFeedOverlay, setShowIgFeedOverlay] = useState(false);
  const [igFeedOverlayOpacity, setIgFeedOverlayOpacity] = useState(0.4);
  const [igFeedOverlayScale, setIgFeedOverlayScale] = useState(1);
  const [igFeedOverlayOffsetX, setIgFeedOverlayOffsetX] = useState(0);
  const [igFeedOverlayOffsetY, setIgFeedOverlayOffsetY] = useState(0);
  const [mockupBackdropColor, setMockupBackdropColor] = useState(DEFAULT_MOCKUP_BACKDROP);
  const [transparentPngExport, setTransparentPngExport] = useState(false);

  // Inline renaming
  const [editingName, setEditingName] = useState<EditingName | null>(null);
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [workspaceRenameDraft, setWorkspaceRenameDraft] = useState("");
  const [workspaceNameFieldDraft, setWorkspaceNameFieldDraft] = useState("");
  const [editingCampaignTitleId, setEditingCampaignTitleId] = useState<string | null>(null);
  const [editingCampaignTitleDraft, setEditingCampaignTitleDraft] = useState("");

  // Tree expand/collapse
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [workspaceTreeData, setWorkspaceTreeData] = useState<Record<string, AppData>>({});
  const [workspaceTreeLoading, setWorkspaceTreeLoading] = useState<Record<string, boolean>>({});
  const [workspaceTreeErrors, setWorkspaceTreeErrors] = useState<Record<string, string>>({});
  const [storyCtaOffsets, setStoryCtaOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [engagementSettings, setEngagementSettings] = useState<
    Record<string, { preset: EngagementPreset; seed: number }>
  >({});
  const [engagementRollNonce, setEngagementRollNonce] = useState<
    Record<string, number>
  >({});
  const [draggingCampaignId, setDraggingCampaignId] = useState<string | null>(null);
  const [draggingCampaignPayload, setDraggingCampaignPayload] =
    useState<CampaignDragPayload | null>(null);
  const [campaignDropTarget, setCampaignDropTarget] = useState<string | null>(null);
  const [campaignDropCampaignTarget, setCampaignDropCampaignTarget] =
    useState<string | null>(null);
  const [campaignDropCampaignPosition, setCampaignDropCampaignPosition] =
    useState<DropInsertPosition>("before");
  const [uploadingTransferTargets, setUploadingTransferTargets] = useState<
    Record<string, number>
  >({});
  const [draggingProjectPayload, setDraggingProjectPayload] =
    useState<ProjectDragPayload | null>(null);
  const [projectDropWorkspaceId, setProjectDropWorkspaceId] = useState<string | null>(null);

  // Campaign settings drafts
  const [settingsDraft, setSettingsDraft] = useState<
    Record<string, { audienceText: string; pillarsText: string }>
  >({});
  const [ctaColorDrafts, setCtaColorDrafts] = useState<Record<string, string>>({});

  // Media per campaign
  const [campaignMedia, setCampaignMediaMap] = useState<Record<string, PreviewMedia>>({});
  const campaignMediaRef = useRef<Record<string, PreviewMedia>>({});

  // Copy flash
  const [copyFlash, setCopyFlash] = useState(false);
  const [copyLinkFlash, setCopyLinkFlash] = useState(false);

  const canvasRef = useRef<PreviewCanvasHandle>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const handoffNoticeTimeoutRef = useRef<number | null>(null);
  const handoffReleaseTimeoutRef = useRef<number | null>(null);

  // Preview body ref for auto-zoom
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const previewExportRef = useRef<HTMLDivElement>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeepLinkRef = useRef<CampaignDeepLinkTarget | null>(null);
  const handledDeepLinkKeyRef = useRef("");
  const applyingDeepLinkRef = useRef(false);
  const hydratedWorkspaceRef = useRef<string>("");
  const workspaceTreeDataRef = useRef<Record<string, AppData>>({});
  const cloudWorkspaceDataSignatureRef = useRef<Record<string, string>>({});
  const [pendingDeepLinkKey, setPendingDeepLinkKey] = useState<string | null>(null);
  const localWorkspace =
    workspaces.find((w) => w.kind === "local") ?? createLocalWorkspace();
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? localWorkspace;
  const activeWorkspaceMembers = workspaceMembersByWorkspace[activeWorkspaceId] ?? [];
  const activeWorkspaceMembership =
    activeWorkspaceMembers.find((member) => member.isCurrentUser) ??
    (authUser
      ? activeWorkspaceMembers.find((member) => member.userId === authUser.id)
      : undefined);
  const canDeleteActiveWorkspace =
    activeWorkspace.kind === "organization" &&
    activeWorkspaceMembership?.role === "owner";
  const activeWorkspaceIsLocal = activeWorkspace.kind === "local";
  const activeWorkspaceRevision =
    typeof activeWorkspace.revision === "number" ? activeWorkspace.revision : 0;
  const effectiveProfileDisplayName =
    profileDisplayNameSaved.trim() ||
    defaultProfileDisplayName(authUser?.email ?? null);

  function campaignLinkForSelection(
    workspaceId: string,
    nextSelection: Selection
  ): string | null {
    if (typeof window === "undefined") return null;
    if (!nextSelection.clientId || !nextSelection.projectId || !nextSelection.campaignId) {
      return null;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(WS_PARAM_KEY, workspaceId);
    url.searchParams.set(CLIENT_PARAM_KEY, nextSelection.clientId);
    url.searchParams.set(PROJECT_PARAM_KEY, nextSelection.projectId);
    url.searchParams.set(CAMPAIGN_PARAM_KEY, nextSelection.campaignId);
    return url.toString();
  }

  function copyTextWithFeedback(
    value: string,
    onSuccess: () => void
  ): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(onSuccess).catch(() => {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "true");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand("copy");
          onSuccess();
        } catch {
          // noop
        } finally {
          document.body.removeChild(area);
        }
      });
      return;
    }
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      onSuccess();
    } catch {
      // noop
    } finally {
      document.body.removeChild(area);
    }
  }

  function setWorkspaceRevision(workspaceId: string, revision: number) {
    const normalized = Math.max(0, Math.floor(revision));
    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, revision: normalized } : workspace
      )
    );
  }

  function setWorkspaceConflict(workspaceId: string, message: string) {
    setWorkspaceSyncConflicts((prev) => ({ ...prev, [workspaceId]: message }));
  }

  function clearWorkspaceConflict(workspaceId: string) {
    setWorkspaceSyncConflicts((prev) => {
      if (!(workspaceId in prev)) return prev;
      const { [workspaceId]: _ignored, ...rest } = prev;
      return rest;
    });
  }

  function setCloudDataSignatureValue(workspaceId: string, signature: string) {
    cloudWorkspaceDataSignatureRef.current[workspaceId] = signature;
  }

  function setCloudDataSignature(workspaceId: string, nextData: AppData) {
    try {
      setCloudDataSignatureValue(workspaceId, JSON.stringify(nextData));
    } catch {
      delete cloudWorkspaceDataSignatureRef.current[workspaceId];
    }
  }

  async function resolveStaleWorkspaceConflict(
    workspaceId: string,
    expectedData: AppData
  ): Promise<boolean> {
    if (!cloudEnabled || !supabase || !authUser) return false;
    try {
      const [remoteDataRaw, latestWorkspaces] = await Promise.all([
        loadCloudWorkspaceData(supabase, workspaceId),
        refreshCloudWorkspaceList(),
      ]);
      const remoteData = normalizeData(remoteDataRaw as AppData);
      const expectedSerialized = JSON.stringify(expectedData);
      const remoteSerialized = JSON.stringify(remoteData);
      const latestWorkspace = latestWorkspaces.find(
        (workspace) => workspace.id === workspaceId
      );
      if (latestWorkspace && typeof latestWorkspace.revision === "number") {
        setWorkspaceRevision(workspaceId, latestWorkspace.revision);
      }
      if (expectedSerialized === remoteSerialized) {
        setCloudDataSignatureValue(workspaceId, expectedSerialized);
        clearWorkspaceConflict(workspaceId);
        return true;
      }
    } catch (error) {
      console.warn("Failed to resolve workspace conflict", error);
    }
    return false;
  }

  useEffect(() => {
    if (renamingWorkspaceId) return;
    setWorkspaceRenameDraft(activeWorkspace.name);
    setWorkspaceNameFieldDraft(activeWorkspace.name);
  }, [activeWorkspace.name, renamingWorkspaceId]);

  useEffect(() => {
    if (!showUserSettings) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowUserSettings(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showUserSettings]);

  useEffect(() => {
    setWorkspaceInviteEmailDraft("");
    setWorkspaceInviteRoleDraft("member");
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!cloudEnabled || !supabase || !authUser) {
      setIncomingWorkspaceInvites([]);
      setIncomingWorkspaceInvitesError(null);
      setWorkspaceInvitesByWorkspace({});
      setWorkspaceMembersByWorkspace({});
      setCanCreateSharedWorkspace(false);
      setWorkspaceMembersLoading(false);
      setWorkspaceMembersError(null);
      setWorkspaceInvitesError(null);
      return;
    }
    void refreshIncomingWorkspaceInviteList();
    void refreshUserProfileSettings();
    void refreshSharedWorkspaceCreateAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, supabase, authUser?.id]);

  useEffect(() => {
    if (!cloudEnabled || !supabase || !authUser) return;
    if (activeWorkspace.kind !== "organization") {
      setWorkspaceMembersLoading(false);
      setWorkspaceMembersError(null);
      setWorkspaceInvitesError(null);
      return;
    }
    void refreshWorkspaceMemberList(activeWorkspaceId);
    void refreshWorkspaceInviteList(activeWorkspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, supabase, authUser?.id, activeWorkspaceId, activeWorkspace.kind]);

  useEffect(() => {
    if (!cloudEnabled || !supabase || !authUser) return;
    void refreshSharedWorkspaceCreateAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, supabase, authUser?.id, workspaces, workspaceMembersByWorkspace]);

  function updateLocalWorkspaceName(nextNameRaw: string): string {
    const normalized = normalizeWorkspaceName(nextNameRaw);
    setWorkspaces((prev) => {
      let foundLocal = false;
      const next = prev.map((workspace) => {
        if (workspace.kind !== "local") return workspace;
        foundLocal = true;
        if (workspace.name === normalized) return workspace;
        return { ...workspace, name: normalized };
      });
      if (foundLocal) return next;
      return [{ id: LOCAL_WORKSPACE_ID, name: normalized, kind: "local" }, ...next];
    });
    safeSetLocalStorage(LOCAL_WS_NAME_KEY, normalized);
    return normalized;
  }

  async function updateWorkspaceName(
    workspaceId: string,
    nextNameRaw: string
  ): Promise<string | null> {
    const normalized = normalizeWorkspaceName(nextNameRaw);
    const existing = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!existing) return null;
    if (existing.name === normalized) return normalized;

    const previousName = existing.name;
    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, name: normalized } : workspace
      )
    );

    if (existing.kind === "local") {
      safeSetLocalStorage(LOCAL_WS_NAME_KEY, normalized);
      return normalized;
    }

    if (cloudEnabled && supabase && authUser) {
      const expectedRevision =
        typeof existing.revision === "number" ? existing.revision : 0;
      const { data: updatedWorkspace, error } = await supabase
        .from("workspaces")
        .update({ name: normalized, revision: expectedRevision + 1 })
        .eq("id", workspaceId)
        .eq("revision", expectedRevision)
        .select("revision")
        .maybeSingle();
      if (error || !updatedWorkspace) {
        console.error("Failed to rename workspace", error);
        setWorkspaces((prev) =>
          prev.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, name: previousName } : workspace
          )
        );
        if (!updatedWorkspace) {
          setWorkspaceConflict(
            workspaceId,
            "This workspace changed in another session. Reload or overwrite to continue."
          );
          alert("Workspace changed in another session.");
        } else {
          alert("Unable to rename workspace.");
        }
        return null;
      }
      setWorkspaceRevision(workspaceId, updatedWorkspace.revision);
      clearWorkspaceConflict(workspaceId);
      return normalized;
    }

    return normalized;
  }

  function beginWorkspaceRename(workspaceId: string) {
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) return;
    setRenamingWorkspaceId(workspaceId);
    setWorkspaceRenameDraft(workspace.name);
  }

  async function commitWorkspaceRename() {
    if (!renamingWorkspaceId) return;
    const targetWorkspace = workspaces.find(
      (workspace) => workspace.id === renamingWorkspaceId
    );
    const fallbackName = targetWorkspace?.name ?? activeWorkspace.name;
    const normalized = await updateWorkspaceName(renamingWorkspaceId, workspaceRenameDraft);
    const nextName = normalized ?? fallbackName;
    setWorkspaceRenameDraft(nextName);
    if (renamingWorkspaceId === activeWorkspaceId) {
      setWorkspaceNameFieldDraft(nextName);
    }
    setRenamingWorkspaceId(null);
  }

  function cancelWorkspaceRename() {
    const workspace = renamingWorkspaceId
      ? workspaces.find((entry) => entry.id === renamingWorkspaceId)
      : null;
    setWorkspaceRenameDraft(workspace?.name ?? activeWorkspace.name);
    setRenamingWorkspaceId(null);
  }

  async function commitWorkspaceNameField() {
    const normalized = await updateWorkspaceName(activeWorkspaceId, workspaceNameFieldDraft);
    const nextName = normalized ?? activeWorkspace.name;
    setWorkspaceNameFieldDraft(nextName);
    setWorkspaceRenameDraft(nextName);
  }

  async function refreshUserProfileSettings() {
    if (!cloudEnabled || !supabase || !authUser) {
      setProfileDisplayNameSaved("");
      setProfileDisplayNameDraft("");
      setProfileStatusSaved("");
      setProfileStatusDraft("");
      setProfileImageDataUrlSaved(null);
      setProfileImageDataUrl(null);
      setProfileSettingsError(null);
      setProfileSettingsLoading(false);
      return;
    }

    setProfileSettingsLoading(true);
    setProfileSettingsError(null);
    try {
      const { data: profileRow, error } = await supabase
        .from("profiles")
        .select("email,display_name,profile_image_data_url,status_text")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (error) throw error;

      const displayName =
        typeof profileRow?.display_name === "string" ? profileRow.display_name.trim() : "";
      const statusText =
        typeof profileRow?.status_text === "string" ? profileRow.status_text : "";
      const nextImage =
        typeof profileRow?.profile_image_data_url === "string"
          ? profileRow.profile_image_data_url
          : null;
      setProfileDisplayNameSaved(displayName);
      setProfileDisplayNameDraft(displayName);
      setProfileStatusSaved(statusText);
      setProfileStatusDraft(statusText);
      setProfileImageDataUrlSaved(nextImage);
      setProfileImageDataUrl(nextImage);
    } catch (error) {
      console.warn("Failed to load profile settings", error);
      setProfileSettingsError(normalizeProfileSettingsErrorMessage(error));
      const fallback = defaultProfileDisplayName(authUser.email ?? null);
      setProfileDisplayNameSaved(fallback);
      setProfileDisplayNameDraft(fallback);
      setProfileStatusSaved("");
      setProfileStatusDraft("");
      setProfileImageDataUrlSaved(null);
      setProfileImageDataUrl(null);
    } finally {
      setProfileSettingsLoading(false);
    }
  }

  async function saveUserProfileSettings() {
    if (!cloudEnabled || !supabase || !authUser) return;
    const normalizedDisplayName = profileDisplayNameDraft.trim();
    const normalizedStatus = profileStatusDraft;
    setProfileSettingsSaving(true);
    setProfileSettingsError(null);
    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: authUser.id,
          email: authUser.email ?? "",
          display_name: normalizedDisplayName,
          status_text: normalizedStatus,
          profile_image_data_url: profileImageDataUrl,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setProfileDisplayNameSaved(normalizedDisplayName);
      setProfileDisplayNameDraft(normalizedDisplayName);
      setProfileStatusSaved(normalizedStatus);
      setProfileStatusDraft(normalizedStatus);
      setProfileImageDataUrlSaved(profileImageDataUrl);
    } catch (error) {
      console.warn("Failed to save profile settings", error);
      setProfileSettingsError(
        error instanceof Error ? error.message : "Unable to save profile settings."
      );
    } finally {
      setProfileSettingsSaving(false);
    }
  }

  async function pickUserProfileImage(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProfileImageDataUrl(dataUrl);
    } catch {
      alert("Unable to read image file.");
    }
  }

  async function refreshIncomingWorkspaceInviteList() {
    if (!cloudEnabled || !supabase || !authUser) {
      setIncomingWorkspaceInvites([]);
      setIncomingWorkspaceInvitesError(null);
      return;
    }
    setIncomingWorkspaceInvitesLoading(true);
    setIncomingWorkspaceInvitesError(null);
    try {
      const invites = await listMyPendingWorkspaceInvites(supabase);
      setIncomingWorkspaceInvites(invites);
    } catch (error) {
      console.warn("Failed to load incoming workspace invites", error);
      const message =
        error instanceof Error ? error.message : "Unable to load incoming invites.";
      setIncomingWorkspaceInvitesError(message);
    } finally {
      setIncomingWorkspaceInvitesLoading(false);
    }
  }

  async function refreshSharedWorkspaceCreateAccess() {
    if (!cloudEnabled || !supabase || !authUser) {
      setCanCreateSharedWorkspace(false);
      return;
    }
    try {
      const { count, error } = await supabase
        .from("organization_memberships")
        .select("organization_id", { count: "exact", head: true })
        .eq("user_id", authUser.id)
        .eq("role", "owner")
        .limit(1);
      if (error) throw error;
      setCanCreateSharedWorkspace((count ?? 0) > 0);
    } catch (error) {
      console.warn("Failed to evaluate shared workspace create access", error);
      setCanCreateSharedWorkspace(false);
    }
  }

  async function refreshWorkspaceInviteList(workspaceId = activeWorkspaceId) {
    if (!cloudEnabled || !supabase || !authUser) return;
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace || workspace.kind !== "organization") return;

    const isActive = workspaceId === activeWorkspaceId;
    if (isActive) {
      setWorkspaceInvitesLoading(true);
      setWorkspaceInvitesError(null);
    }
    try {
      const invites = await listWorkspaceInvites(supabase, workspaceId);
      setWorkspaceInvitesByWorkspace((prev) => ({ ...prev, [workspaceId]: invites }));
    } catch (error) {
      console.warn("Failed to load workspace invites", error);
      if (isActive) {
        const message =
          error instanceof Error ? error.message : "Unable to load workspace invites.";
        setWorkspaceInvitesError(message);
      }
    } finally {
      if (isActive) setWorkspaceInvitesLoading(false);
    }
  }

  async function refreshWorkspaceMemberList(workspaceId = activeWorkspaceId) {
    if (!cloudEnabled || !supabase || !authUser) return;
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace || workspace.kind !== "organization") return;

    const isActive = workspaceId === activeWorkspaceId;
    if (isActive) {
      setWorkspaceMembersLoading(true);
      setWorkspaceMembersError(null);
    }
    try {
      const members = await listWorkspaceMembers(supabase, workspaceId);
      setWorkspaceMembersByWorkspace((prev) => ({ ...prev, [workspaceId]: members }));
    } catch (error) {
      console.warn("Failed to load workspace members", error);
      if (isActive) {
        const message =
          error instanceof Error ? error.message : "Unable to load workspace members.";
        if (message.toLowerCase().includes("list_workspace_members")) {
          setWorkspaceMembersError(
            "Workspace members RPC is missing. Run migration 20260327_workspace_members.sql and refresh."
          );
        } else {
          setWorkspaceMembersError(message);
        }
      }
    } finally {
      if (isActive) setWorkspaceMembersLoading(false);
    }
  }

  async function refreshCloudWorkspaceList(): Promise<Workspace[]> {
    if (!cloudEnabled || !supabase || !authUser) return workspaces;
    const localWorkspaceEntry = createLocalWorkspace();
    const wsList = await listAccessibleWorkspaces(supabase, authUser.id);
    const resolved: Workspace[] = [
      localWorkspaceEntry,
      ...wsList
        .filter((workspace) => workspace.id !== localWorkspaceEntry.id)
        .map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          kind: workspace.kind,
          revision: workspace.revision,
        })),
    ];
    setWorkspaces(resolved);
    return resolved;
  }

  async function enableActiveWorkspaceCollaboration() {
    if (activeWorkspace.kind !== "personal") return;
    if (!cloudEnabled || !supabase || !authUser) return;
    setWorkspaceInviteUpgradeLoading(true);
    setWorkspaceInvitesError(null);
    try {
      await convertWorkspaceToOrganization(supabase, activeWorkspaceId);
      const nextWorkspaces = await refreshCloudWorkspaceList();
      const nextWorkspace = nextWorkspaces.find(
        (workspace) => workspace.id === activeWorkspaceId
      );
      if (!nextWorkspace || nextWorkspace.kind !== "organization") {
        throw new Error("Workspace conversion did not complete.");
      }
      await Promise.all([
        refreshWorkspaceMemberList(activeWorkspaceId),
        refreshWorkspaceInviteList(activeWorkspaceId),
      ]);
    } catch (error) {
      console.warn("Failed to enable workspace collaboration", error);
      let message =
        error instanceof Error
          ? error.message
          : "Unable to enable collaboration for this workspace.";
      if (
        typeof message === "string" &&
        message.toLowerCase().includes("convert_workspace_to_organization")
      ) {
        message =
          "Workspace conversion RPC is missing. Run migration 20260327_convert_workspace_to_org.sql and refresh.";
      }
      setWorkspaceInvitesError(message);
      alert(message);
    } finally {
      setWorkspaceInviteUpgradeLoading(false);
    }
  }

  async function addWorkspaceInvite() {
    if (activeWorkspace.kind !== "organization") return;
    if (!cloudEnabled || !supabase || !authUser) return;
    const email = workspaceInviteEmailDraft.trim().toLowerCase();
    if (!email) return;
    if (!isLikelyEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }
    setWorkspaceInvitesSaving(true);
    setWorkspaceInvitesError(null);
    try {
      await createWorkspaceInvite(
        supabase,
        activeWorkspaceId,
        email,
        workspaceInviteRoleDraft
      );
      setWorkspaceInviteEmailDraft("");
      await Promise.all([
        refreshWorkspaceMemberList(activeWorkspaceId),
        refreshWorkspaceInviteList(activeWorkspaceId),
        refreshIncomingWorkspaceInviteList(),
      ]);
    } catch (error) {
      console.warn("Failed to create workspace invite", error);
      const message =
        error instanceof Error ? error.message : "Unable to create workspace invite.";
      setWorkspaceInvitesError(message);
      alert(message);
    } finally {
      setWorkspaceInvitesSaving(false);
    }
  }

  async function removeWorkspaceInvite(inviteId: string) {
    if (activeWorkspace.kind !== "organization") return;
    if (!cloudEnabled || !supabase || !authUser) return;
    setWorkspaceInvitesSaving(true);
    setWorkspaceInvitesError(null);
    try {
      await revokeWorkspaceInvite(supabase, inviteId);
      await Promise.all([
        refreshWorkspaceMemberList(activeWorkspaceId),
        refreshWorkspaceInviteList(activeWorkspaceId),
        refreshIncomingWorkspaceInviteList(),
      ]);
    } catch (error) {
      console.warn("Failed to revoke workspace invite", error);
      const message =
        error instanceof Error ? error.message : "Unable to revoke workspace invite.";
      setWorkspaceInvitesError(message);
      alert(message);
    } finally {
      setWorkspaceInvitesSaving(false);
    }
  }

  async function acceptIncomingWorkspaceInvite(inviteId: string) {
    if (!cloudEnabled || !supabase || !authUser) return;
    setIncomingWorkspaceInvitesLoading(true);
    setIncomingWorkspaceInvitesError(null);
    try {
      const accepted = await acceptWorkspaceInvite(supabase, inviteId);
      const nextWorkspaces = await refreshCloudWorkspaceList();
      const targetWorkspace = nextWorkspaces.find(
        (workspace) => workspace.id === accepted.workspaceId
      );
      if (!targetWorkspace) {
        throw new Error("Invite accepted but workspace is not visible yet.");
      }

      const cloudData = (await loadCloudWorkspaceData(
        supabase,
        accepted.workspaceId
      )) as CloudAppData;
      const normalized = normalizeData(cloudData as AppData);
      setCloudDataSignature(accepted.workspaceId, normalized);
      hydratedWorkspaceRef.current = accepted.workspaceId;
      setActiveWorkspaceId(accepted.workspaceId);
      setData(normalized);
      setWorkspaceTreeData((prev) => ({ ...prev, [accepted.workspaceId]: normalized }));
      setSelection(defaultSelection(normalized));
      setSelectionLevel("workspace");
      replaceCampaignMedia({});
      await hydrateSignedMediaForWorkspace(accepted.workspaceId, normalized);

      await Promise.all([
        refreshWorkspaceMemberList(accepted.workspaceId),
        refreshIncomingWorkspaceInviteList(),
        refreshWorkspaceInviteList(accepted.workspaceId),
      ]);
    } catch (error) {
      console.warn("Failed to accept workspace invite", error);
      const message =
        error instanceof Error ? error.message : "Unable to accept workspace invite.";
      setIncomingWorkspaceInvitesError(message);
      alert(message);
    } finally {
      setIncomingWorkspaceInvitesLoading(false);
    }
  }

  async function reloadActiveWorkspaceFromCloud() {
    if (activeWorkspaceIsLocal) return;
    if (!cloudEnabled || !supabase || !authUser) return;
    setStorageReady(false);
    try {
      const cloudData = (await loadCloudWorkspaceData(
        supabase,
        activeWorkspaceId
      )) as CloudAppData;
      const normalized = normalizeData(cloudData as AppData);
      setCloudDataSignature(activeWorkspaceId, normalized);
      const nextSelection = coerceSelection(normalized, selection);
      const nextLevel =
        nextSelection.campaignId
          ? selectionLevel
          : nextSelection.projectId
          ? "project"
          : nextSelection.clientId
          ? "client"
          : "workspace";
      setData(normalized);
      setWorkspaceTreeData((prev) => ({ ...prev, [activeWorkspaceId]: normalized }));
      setSelection(nextSelection);
      setSelectionLevel(nextLevel);
      replaceCampaignMedia({});
      await hydrateSignedMediaForWorkspace(activeWorkspaceId, normalized);

      const latestWorkspaces = await refreshCloudWorkspaceList();
      const latestWorkspace = latestWorkspaces.find(
        (workspace) => workspace.id === activeWorkspaceId
      );
      if (latestWorkspace && typeof latestWorkspace.revision === "number") {
        setWorkspaceRevision(activeWorkspaceId, latestWorkspace.revision);
      }
      clearWorkspaceConflict(activeWorkspaceId);
    } catch (error) {
      console.warn("Failed to reload workspace from cloud", error);
      const message =
        error instanceof Error ? error.message : "Unable to reload workspace.";
      alert(message);
    } finally {
      setStorageReady(true);
    }
  }

  async function overwriteActiveWorkspaceWithLocal() {
    if (activeWorkspaceIsLocal) return;
    if (!cloudEnabled || !supabase || !authUser) return;
    try {
      const latestWorkspaces = await refreshCloudWorkspaceList();
      const latestWorkspace = latestWorkspaces.find(
        (workspace) => workspace.id === activeWorkspaceId
      );
      if (!latestWorkspace) {
        throw new Error("Workspace no longer exists.");
      }
      const expectedRevision =
        typeof latestWorkspace.revision === "number" ? latestWorkspace.revision : 0;
      const saved = await saveWorkspaceData(
        supabase,
        activeWorkspaceId,
        data as CloudAppData,
        authUser.id,
        expectedRevision
      );
      setCloudDataSignature(activeWorkspaceId, data);
      setWorkspaceRevision(activeWorkspaceId, saved.revision);
      clearWorkspaceConflict(activeWorkspaceId);
    } catch (error) {
      if (error instanceof CloudWorkspaceConflictError) {
        setWorkspaceConflict(activeWorkspaceId, error.message);
        return;
      }
      console.warn("Failed to overwrite workspace", error);
      const message =
        error instanceof Error ? error.message : "Unable to overwrite remote workspace.";
      alert(message);
    }
  }

  function clientExpandKey(clientId: string, workspaceId = activeWorkspaceId): string {
    return `${workspaceId}::client::${clientId}`;
  }

  function workspaceExpandKey(workspaceId: string): string {
    return `workspace::${workspaceId}`;
  }

  function projectExpandKey(projectId: string, workspaceId = activeWorkspaceId): string {
    return `${workspaceId}::project::${projectId}`;
  }

  function campaignDropTargetKey(projectId: string, workspaceId = activeWorkspaceId): string {
    return `${workspaceId}::project-drop::${projectId}`;
  }

  function campaignRowDropTargetKey(
    campaignId: string,
    workspaceId = activeWorkspaceId
  ): string {
    return `${workspaceId}::campaign-drop::${campaignId}`;
  }

  function dropInsertPositionFromEvent(
    e: React.DragEvent<HTMLDivElement>
  ): DropInsertPosition {
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    return e.clientY > midpoint ? "after" : "before";
  }

  function transferUploadTargetKey(projectId: string, workspaceId = activeWorkspaceId): string {
    return `${workspaceId}::project-upload::${projectId}`;
  }

  function beginTransferUploadIndicator(
    workspaceId: string,
    projectId: string,
    count = 1
  ) {
    const key = transferUploadTargetKey(projectId, workspaceId);
    setUploadingTransferTargets((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 0) + Math.max(1, count),
    }));
  }

  function endTransferUploadIndicator(
    workspaceId: string,
    projectId: string,
    count = 1
  ) {
    const key = transferUploadTargetKey(projectId, workspaceId);
    setUploadingTransferTargets((prev) => {
      const nextCount = Math.max(0, (prev[key] ?? 0) - Math.max(1, count));
      if (nextCount <= 0) {
        const { [key]: _ignored, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: nextCount };
    });
  }

  function storyCtaOffsetKey(campaignId: string, workspaceId = activeWorkspaceId): string {
    return `${workspaceId}::story-cta::${campaignId}`;
  }

  function engagementSettingKey(campaignId: string, workspaceId = activeWorkspaceId): string {
    return `${workspaceId}::engagement::${campaignId}`;
  }

  function engagementSettingForCampaign(
    campaignId: string,
    workspaceId = activeWorkspaceId
  ): { preset: EngagementPreset; seed: number } {
    const key = engagementSettingKey(campaignId, workspaceId);
    return (
      engagementSettings[key] ?? {
        preset: DEFAULT_ENGAGEMENT_PRESET,
        seed: stableSeedFromText(key),
      }
    );
  }

  const refreshLocalDebugStats = useCallback(async () => {
    if (typeof window === "undefined") return;
    const debugWorkspaceId = LOCAL_WORKSPACE_ID;
    setDebugPanelLoading(true);
    setDebugPanelError(null);
    try {
      const snapshot = await getLocalWorkspaceState<WorkspaceStateSnapshot>(debugWorkspaceId);
      const mediaAssets = await listLocalMediaAssetsForWorkspace(debugWorkspaceId);
      const workspaceData = snapshot?.data ? normalizeData(snapshot.data) : emptyWorkspace();
      const entityCounts = countWorkspaceEntities(workspaceData);
      const snapshotBytes = snapshot ? measureUtf8Bytes(JSON.stringify(snapshot)) : 0;

      let images = 0;
      let videos = 0;
      let mediaBytes = 0;
      for (const asset of mediaAssets) {
        if (asset.kind === "image") images += 1;
        else videos += 1;
        mediaBytes += asset.blob.size;
      }

      let legacyWorkspaceKeys = 0;
      let legacyWorkspaceBytes = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key === LEGACY_STORAGE_KEY || key.startsWith(WS_DATA_PREFIX)) {
          legacyWorkspaceKeys += 1;
          const value = localStorage.getItem(key) ?? "";
          legacyWorkspaceBytes += measureUtf8Bytes(value);
        }
      }

      const uiKeys = [UI_KEY, WORKSPACES_KEY, ACTIVE_WS_KEY, CLOUD_ACTIVE_WS_KEY];
      let uiBytes = 0;
      for (const key of uiKeys) {
        const value = localStorage.getItem(key);
        if (!value) continue;
        uiBytes += measureUtf8Bytes(value);
      }

      setLocalDebugStats({
        generatedAtIso: new Date().toISOString(),
        debugWorkspaceId,
        activeWorkspaceKind: activeWorkspace.kind,
        workspaceSnapshot: {
          exists: Boolean(snapshot),
          clients: entityCounts.clients,
          projects: entityCounts.projects,
          campaigns: entityCounts.campaigns,
          bytes: snapshotBytes,
        },
        media: {
          count: mediaAssets.length,
          images,
          videos,
          bytes: mediaBytes,
        },
        localStorage: {
          uiBytes,
          legacyWorkspaceKeys,
          legacyWorkspaceBytes,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load debug stats.";
      setDebugPanelError(message);
    } finally {
      setDebugPanelLoading(false);
    }
  }, [activeWorkspace.kind]);

  const refreshWorkspaceStorageEstimate = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.storage) {
      setWorkspaceStorageEstimate(null);
      setWorkspaceStorageError("Storage estimate is unavailable in this browser.");
      return;
    }

    setWorkspaceStorageLoading(true);
    setWorkspaceStorageError(null);
    try {
      const estimate = await navigator.storage.estimate();
      const usage = Math.max(0, estimate.usage ?? 0);
      const quota = Math.max(0, estimate.quota ?? 0);
      const free = Math.max(0, quota - usage);
      const usagePct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;
      const persisted =
        typeof navigator.storage.persisted === "function"
          ? await navigator.storage.persisted()
          : null;

      setWorkspaceStorageEstimate({
        usage,
        quota,
        free,
        usagePct,
        persisted,
        generatedAtIso: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to estimate browser storage.";
      setWorkspaceStorageEstimate(null);
      setWorkspaceStorageError(message);
    } finally {
      setWorkspaceStorageLoading(false);
    }
  }, []);

  const loadWorkspaceDataForTree = useCallback(
    async (workspaceId: string, force = false) => {
      const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
      if (!workspace) return null;
      if (!force && workspaceTreeDataRef.current[workspaceId]) {
        return workspaceTreeDataRef.current[workspaceId];
      }

      setWorkspaceTreeLoading((prev) => ({ ...prev, [workspaceId]: true }));
      setWorkspaceTreeErrors((prev) => {
        if (!prev[workspaceId]) return prev;
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });

      try {
        let loadedData: AppData;
        if (workspaceId === activeWorkspaceId) {
          loadedData = data;
        } else if (workspace.kind === "local") {
          const local = await loadPrimaryLocalWorkspaceState();
          loadedData = local.data;
        } else if (cloudEnabled && supabase && authUser) {
          const cloudData = (await loadCloudWorkspaceData(
            supabase,
            workspaceId
          )) as CloudAppData;
          loadedData = normalizeData(cloudData as AppData);
        } else {
          loadedData = emptyWorkspace();
        }

        setWorkspaceTreeData((prev) => ({
          ...prev,
          [workspaceId]: loadedData,
        }));
        return loadedData;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load workspace.";
        setWorkspaceTreeErrors((prev) => ({ ...prev, [workspaceId]: message }));
        return null;
      } finally {
        setWorkspaceTreeLoading((prev) => ({ ...prev, [workspaceId]: false }));
      }
    },
    [
      activeWorkspaceId,
      authUser,
      cloudEnabled,
      data,
      supabase,
      workspaces,
    ]
  );

  // ── Persistence ────────────────────────────────────────────────

  // Persist workspace list + active workspace id
  useEffect(() => {
    if (!storageReady) return;
    if (cloudEnabled) return;
    safeSetLocalStorage(WORKSPACES_KEY, JSON.stringify(workspaces));
  }, [cloudEnabled, storageReady, workspaces]);

  useEffect(() => {
    if (!storageReady) return;
    safeSetLocalStorage(
      cloudEnabled ? CLOUD_ACTIVE_WS_KEY : ACTIVE_WS_KEY,
      activeWorkspaceId
    );
  }, [cloudEnabled, storageReady, activeWorkspaceId]);

  // Persist current workspace data
  useEffect(() => {
    if (!storageReady) return;
    if (!cloudEnabled || activeWorkspaceIsLocal) {
      void setLocalWorkspaceState(activeWorkspaceId, {
        data,
        selection,
        level: selectionLevel,
      });
      return;
    }
    if (!supabase || !authUser || !cloudHydrated) return;
    if (hydratedWorkspaceRef.current !== activeWorkspaceId) return;
    const dataSnapshot = data;
    const dataSignature = JSON.stringify(dataSnapshot);
    const lastSavedSignature =
      cloudWorkspaceDataSignatureRef.current[activeWorkspaceId];
    if (lastSavedSignature === undefined) {
      setCloudDataSignatureValue(activeWorkspaceId, dataSignature);
      clearWorkspaceConflict(activeWorkspaceId);
      return;
    }
    if (lastSavedSignature === dataSignature) {
      if (workspaceSyncConflicts[activeWorkspaceId]) {
        void resolveStaleWorkspaceConflict(activeWorkspaceId, dataSnapshot);
      }
      return;
    }
    if (workspaceSyncConflicts[activeWorkspaceId]) {
      void resolveStaleWorkspaceConflict(activeWorkspaceId, dataSnapshot);
      return;
    }

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      void saveWorkspaceData(
        supabase,
        activeWorkspaceId,
        dataSnapshot as CloudAppData,
        authUser.id,
        activeWorkspaceRevision
      ).catch(async (error) => {
        if (error instanceof CloudWorkspaceConflictError) {
          const resolved = await resolveStaleWorkspaceConflict(
            activeWorkspaceId,
            dataSnapshot
          );
          if (resolved) return;
          setWorkspaceConflict(activeWorkspaceId, error.message);
          return;
        }
        console.warn("Failed to save workspace", error);
      }).then((result) => {
        if (!result) return;
        setCloudDataSignatureValue(activeWorkspaceId, dataSignature);
        setWorkspaceRevision(activeWorkspaceId, result.revision);
        clearWorkspaceConflict(activeWorkspaceId);
      });
    }, 500);
  }, [
    storageReady,
    cloudEnabled,
    activeWorkspaceIsLocal,
    supabase,
    authUser,
    cloudHydrated,
    data,
    selection,
    selectionLevel,
    activeWorkspaceId,
    activeWorkspaceRevision,
    workspaceSyncConflicts,
  ]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!storageReady) return;
    const refs = collectRenderableMediaRefs(data);
    if (refs.length === 0) return;

    const missingMedia = refs.some((ref) => {
      const media = campaignMedia[ref.campaignId];
      return !media || media.kind === "none";
    });
    if (!missingMedia) return;

    if (!cloudEnabled || activeWorkspaceIsLocal) {
      void hydrateLocalMediaForWorkspace(activeWorkspaceId, data).catch((error) => {
        console.error("Failed to rehydrate local media", error);
      });
      return;
    }

    void hydrateSignedMediaForWorkspace(activeWorkspaceId, data).catch((error) => {
      console.error("Failed to rehydrate signed media", error);
    });
  }, [
    storageReady,
    cloudEnabled,
    activeWorkspaceIsLocal,
    activeWorkspaceId,
    data,
    campaignMedia,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    safeSetLocalStorage(
      UI_KEY,
      JSON.stringify({
        panelWidths,
        darkMode,
        showIgFeedOverlay,
        igFeedOverlayOpacity,
        igFeedOverlayScale,
        igFeedOverlayOffsetX,
        igFeedOverlayOffsetY,
        mockupBackdropColor,
        transparentPngExport,
        expandedWorkspaces,
        expandedClients,
        expandedProjects,
        storyCtaOffsets,
        engagementSettings,
      })
    );
  }, [
    storageReady,
    panelWidths,
    darkMode,
    showIgFeedOverlay,
    igFeedOverlayOpacity,
    igFeedOverlayScale,
    igFeedOverlayOffsetX,
    igFeedOverlayOffsetY,
    mockupBackdropColor,
    transparentPngExport,
    expandedWorkspaces,
    expandedClients,
    expandedProjects,
    storyCtaOffsets,
    engagementSettings,
  ]);

  useEffect(() => {
    campaignMediaRef.current = campaignMedia;
  }, [campaignMedia]);

  useEffect(() => {
    workspaceTreeDataRef.current = workspaceTreeData;
  }, [workspaceTreeData]);

  useEffect(() => {
    if (!storageReady) return;
    setWorkspaceTreeData((prev) => ({
      ...prev,
      [activeWorkspaceId]: data,
    }));
  }, [storageReady, activeWorkspaceId, data]);

  useEffect(() => {
    setWorkspaceTreeData((prev) => {
      const allowed = new Set(workspaces.map((workspace) => workspace.id));
      const next: Record<string, AppData> = {};
      let changed = false;
      for (const [workspaceId, workspaceData] of Object.entries(prev)) {
        if (!allowed.has(workspaceId)) {
          changed = true;
          continue;
        }
        next[workspaceId] = workspaceData;
      }
      return changed ? next : prev;
    });
    setWorkspaceTreeLoading((prev) => {
      const allowed = new Set(workspaces.map((workspace) => workspace.id));
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [workspaceId, isLoading] of Object.entries(prev)) {
        if (!allowed.has(workspaceId)) {
          changed = true;
          continue;
        }
        next[workspaceId] = isLoading;
      }
      return changed ? next : prev;
    });
    setWorkspaceTreeErrors((prev) => {
      const allowed = new Set(workspaces.map((workspace) => workspace.id));
      const next: Record<string, string> = {};
      let changed = false;
      for (const [workspaceId, message] of Object.entries(prev)) {
        if (!allowed.has(workspaceId)) {
          changed = true;
          continue;
        }
        next[workspaceId] = message;
      }
      return changed ? next : prev;
    });
    setWorkspaceSyncConflicts((prev) => {
      const allowed = new Set(workspaces.map((workspace) => workspace.id));
      const next: Record<string, string> = {};
      let changed = false;
      for (const [workspaceId, message] of Object.entries(prev)) {
        if (!allowed.has(workspaceId)) {
          changed = true;
          continue;
        }
        next[workspaceId] = message;
      }
      return changed ? next : prev;
    });
    const allowed = new Set(workspaces.map((workspace) => workspace.id));
    for (const workspaceId of Object.keys(cloudWorkspaceDataSignatureRef.current)) {
      if (!allowed.has(workspaceId)) {
        delete cloudWorkspaceDataSignatureRef.current[workspaceId];
      }
    }
  }, [workspaces]);

  useEffect(() => {
    if (!debugPanelOpen) return;
    if (!storageReady) return;
    void refreshLocalDebugStats();
  }, [debugPanelOpen, storageReady, activeWorkspaceId, refreshLocalDebugStats]);

  useEffect(() => {
    if (!storageReady) return;
    for (const workspace of workspaces) {
      const isExpanded = expandedWorkspaces[workspaceExpandKey(workspace.id)] !== false;
      if (!isExpanded) continue;
      if (workspaceTreeDataRef.current[workspace.id]) continue;
      if (workspaceTreeLoading[workspace.id]) continue;
      void loadWorkspaceDataForTree(workspace.id);
    }
  }, [
    storageReady,
    workspaces,
    expandedWorkspaces,
    workspaceTreeLoading,
    loadWorkspaceDataForTree,
  ]);

  useEffect(() => {
    if (!storageReady) return;
    if (selectionLevel !== "workspace") return;
    if (!activeWorkspaceIsLocal) {
      setWorkspaceStorageEstimate(null);
      setWorkspaceStorageError(null);
      return;
    }
    void refreshWorkspaceStorageEstimate();
  }, [
    storageReady,
    selectionLevel,
    activeWorkspaceId,
    activeWorkspaceIsLocal,
    refreshWorkspaceStorageEstimate,
  ]);

  useEffect(() => {
    const campaignId = cleanParam(searchParams.get(CAMPAIGN_PARAM_KEY));
    if (!campaignId) {
      pendingDeepLinkRef.current = null;
      setPendingDeepLinkKey(null);
      return;
    }
    const target = {
      workspaceId: cleanParam(searchParams.get(WS_PARAM_KEY)),
      clientId: cleanParam(searchParams.get(CLIENT_PARAM_KEY)),
      projectId: cleanParam(searchParams.get(PROJECT_PARAM_KEY)),
      campaignId,
    };
    const key = deepLinkKeyFromTarget(target);
    pendingDeepLinkRef.current = { ...target, key };
    if (handledDeepLinkKeyRef.current !== key) {
      setPendingDeepLinkKey(key);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!pendingDeepLinkKey) return;
    const deepLinkReady =
      storageReady && (!cloudEnabled || (authReady && Boolean(authUser) && cloudHydrated));
    if (!deepLinkReady) return;
    if (applyingDeepLinkRef.current) return;
    const target = pendingDeepLinkRef.current;
    if (!target || target.key !== pendingDeepLinkKey) return;

    applyingDeepLinkRef.current = true;
    void (async () => {
      try {
        const targetWorkspaceId = target.workspaceId || activeWorkspaceId;
        const targetWorkspace = workspaces.find(
          (workspace) => workspace.id === targetWorkspaceId
        );
        if (!targetWorkspace) {
          alert("This ad link points to a workspace you cannot access.");
          return;
        }
        const targetData = await getWorkspaceDataForTransfer(targetWorkspaceId);
        if (!targetData) {
          alert("Unable to load the linked workspace.");
          return;
        }

        let resolvedSelection: Selection | null = null;
        if (target.clientId && target.projectId) {
          const client = targetData.clients.find((candidate) => candidate.id === target.clientId);
          const project = client?.projects.find((candidate) => candidate.id === target.projectId);
          const campaign = project?.campaigns.find(
            (candidate) => candidate.id === target.campaignId
          );
          if (client && project && campaign) {
            resolvedSelection = {
              clientId: client.id,
              projectId: project.id,
              campaignId: campaign.id,
            };
          }
        }
        if (!resolvedSelection) {
          for (const client of targetData.clients) {
            for (const project of client.projects) {
              const campaign = project.campaigns.find(
                (candidate) => candidate.id === target.campaignId
              );
              if (!campaign) continue;
              resolvedSelection = {
                clientId: client.id,
                projectId: project.id,
                campaignId: campaign.id,
              };
              break;
            }
            if (resolvedSelection) break;
          }
        }
        if (!resolvedSelection) {
          alert("This ad link is no longer valid.");
          return;
        }
        await switchWorkspace(targetWorkspaceId, "campaign", resolvedSelection);
      } finally {
        handledDeepLinkKeyRef.current = pendingDeepLinkKey;
        applyingDeepLinkRef.current = false;
        setPendingDeepLinkKey(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingDeepLinkKey,
    storageReady,
    cloudEnabled,
    authReady,
    authUser?.id,
    cloudHydrated,
    activeWorkspaceId,
    workspaces,
  ]);

  useEffect(() => {
    if (!storageReady) return;
    if (pendingDeepLinkKey) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const shouldLinkCampaign =
      selectionLevel === "campaign" &&
      Boolean(selection.clientId) &&
      Boolean(selection.projectId) &&
      Boolean(selection.campaignId);
    if (shouldLinkCampaign) {
      url.searchParams.set(WS_PARAM_KEY, activeWorkspaceId);
      url.searchParams.set(CLIENT_PARAM_KEY, selection.clientId);
      url.searchParams.set(PROJECT_PARAM_KEY, selection.projectId);
      url.searchParams.set(CAMPAIGN_PARAM_KEY, selection.campaignId);
    } else {
      url.searchParams.delete(WS_PARAM_KEY);
      url.searchParams.delete(CLIENT_PARAM_KEY);
      url.searchParams.delete(PROJECT_PARAM_KEY);
      url.searchParams.delete(CAMPAIGN_PARAM_KEY);
    }
    const nextSearch = url.searchParams.toString();
    const currentSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    if (nextSearch === currentSearch) return;
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [
    storageReady,
    pendingDeepLinkKey,
    selectionLevel,
    activeWorkspaceId,
    selection.clientId,
    selection.projectId,
    selection.campaignId,
  ]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const m of Object.values(campaignMediaRef.current)) {
        if (m.kind !== "none") revokeMediaUrl(m.url);
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
    const CONTENT_W = 340;
    const CONTENT_H = Math.round(340 * (2969 / 1842));
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      // Divide by ZOOM_BASE so auto-fit initializes at zoom=1.0 (= 100% display, scale(1.4) visually)
      const rawZoom = Math.min((width - 32) / CONTENT_W, (height - 32) / CONTENT_H);
      const clamped = Math.min(1.4, Math.max(0.35, +(rawZoom / ZOOM_BASE).toFixed(2)));
      setZoom(clamped);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
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

  useEffect(() => {
    if (!selectedCampaign) {
      setEditingCampaignTitleId(null);
      setEditingCampaignTitleDraft("");
      return;
    }
    if (editingCampaignTitleId && editingCampaignTitleId !== selectedCampaign.id) {
      setEditingCampaignTitleId(null);
    }
    if (!editingCampaignTitleId) {
      setEditingCampaignTitleDraft(selectedCampaign.name);
    }
  }, [selectedCampaign?.id, selectedCampaign?.name, editingCampaignTitleId]);

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
  const activeCampaignPresenceOthers = useMemo(
    () => activeCampaignPresence.filter((entry) => !entry.isSelf),
    [activeCampaignPresence]
  );
  const activeCampaignPresenceLabels = useMemo(() => {
    const labels = activeCampaignPresenceOthers.map((entry) =>
      presenceLabelFromIdentity({
        displayName: entry.displayName,
        email: entry.email,
      })
    );
    return Array.from(new Set(labels));
  }, [activeCampaignPresenceOthers]);
  const activeCampaignHasPresenceLock = activeCampaignPresenceOthers.length > 0;
  const activeCampaignEditingLocked =
    cloudEnabled &&
    !activeWorkspaceIsLocal &&
    selectionLevel === "campaign" &&
    Boolean(selectedCampaign) &&
    (activeCampaignHasPresenceLock || activeCampaignHandoffReleased);
  const canCopyCampaignLink =
    !activeWorkspaceIsLocal &&
    selectionLevel === "campaign" &&
    Boolean(selection.clientId) &&
    Boolean(selection.projectId) &&
    Boolean(selection.campaignId);

  useEffect(() => {
    setActiveCampaignHandoffReleased(false);
    setIncomingHandoffRequests([]);
    setIncomingHandoffRequestsError(null);
    setRequestHandoffPending(false);
    setRespondHandoffPendingId(null);
    setRequestHandoffNotice(null);
    if (handoffNoticeTimeoutRef.current) {
      window.clearTimeout(handoffNoticeTimeoutRef.current);
      handoffNoticeTimeoutRef.current = null;
    }
    if (handoffReleaseTimeoutRef.current) {
      window.clearTimeout(handoffReleaseTimeoutRef.current);
      handoffReleaseTimeoutRef.current = null;
    }
  }, [activeWorkspaceId, selectedCampaign?.id]);

  useEffect(() => {
    return () => {
      if (handoffNoticeTimeoutRef.current) {
        window.clearTimeout(handoffNoticeTimeoutRef.current);
        handoffNoticeTimeoutRef.current = null;
      }
      if (handoffReleaseTimeoutRef.current) {
        window.clearTimeout(handoffReleaseTimeoutRef.current);
        handoffReleaseTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cloudEnabled || activeWorkspaceIsLocal || !supabase || !authUser) {
      setActiveCampaignPresence([]);
      setActiveCampaignPresenceLoading(false);
      setActiveCampaignPresenceError(null);
      return;
    }
    if (selectionLevel !== "campaign" || !selectedCampaign) {
      setActiveCampaignPresence([]);
      setActiveCampaignPresenceLoading(false);
      setActiveCampaignPresenceError(null);
      return;
    }

    const workspaceId = activeWorkspaceId;
    const campaignId = selectedCampaign.id;
    let cancelled = false;
    let initialized = false;

    setActiveCampaignPresence([]);
    setActiveCampaignPresenceLoading(true);
    setActiveCampaignPresenceError(null);

    const refreshPresence = async () => {
      try {
        if (!activeCampaignHandoffReleased) {
          await upsertCampaignEditorPresence(supabase, workspaceId, campaignId, 45);
        }
        const entries = await listCampaignEditorPresence(
          supabase,
          workspaceId,
          campaignId
        );
        if (cancelled) return;
        setActiveCampaignPresence(entries);
        setActiveCampaignPresenceError(null);
      } catch (error) {
        if (cancelled) return;
        setActiveCampaignPresenceError(normalizePresenceLockErrorMessage(error));
      } finally {
        if (cancelled) return;
        if (!initialized) {
          setActiveCampaignPresenceLoading(false);
          initialized = true;
        }
      }
    };

    void refreshPresence();
    const heartbeatId = window.setInterval(() => {
      void refreshPresence();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      void clearCampaignEditorPresence(supabase, workspaceId, campaignId).catch(() => {
        // noop: presence cleanup is best-effort.
      });
    };
  }, [
    cloudEnabled,
    activeWorkspaceIsLocal,
    supabase,
    authUser,
    activeWorkspaceId,
    selectionLevel,
    selectedCampaign?.id,
    activeCampaignHandoffReleased,
  ]);

  useEffect(() => {
    if (!cloudEnabled || activeWorkspaceIsLocal || !supabase || !authUser) {
      setIncomingHandoffRequests([]);
      setIncomingHandoffRequestsError(null);
      return;
    }
    if (selectionLevel !== "campaign" || !selectedCampaign) {
      setIncomingHandoffRequests([]);
      setIncomingHandoffRequestsError(null);
      return;
    }

    const workspaceId = activeWorkspaceId;
    const campaignId = selectedCampaign.id;
    let cancelled = false;

    const refreshIncomingRequests = async () => {
      try {
        const requests = await listIncomingCampaignHandoffRequests(
          supabase,
          workspaceId,
          campaignId
        );
        if (cancelled) return;
        setIncomingHandoffRequests(requests);
        setIncomingHandoffRequestsError(null);
      } catch (error) {
        if (cancelled) return;
        setIncomingHandoffRequestsError(normalizeHandoffErrorMessage(error));
      }
    };

    void refreshIncomingRequests();
    const pollId = window.setInterval(() => {
      void refreshIncomingRequests();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [
    cloudEnabled,
    activeWorkspaceIsLocal,
    supabase,
    authUser,
    activeWorkspaceId,
    selectionLevel,
    selectedCampaign?.id,
  ]);

  function showRequestHandoffNotice(message: string) {
    if (handoffNoticeTimeoutRef.current) {
      window.clearTimeout(handoffNoticeTimeoutRef.current);
      handoffNoticeTimeoutRef.current = null;
    }
    setRequestHandoffNotice(message);
    handoffNoticeTimeoutRef.current = window.setTimeout(() => {
      setRequestHandoffNotice(null);
      handoffNoticeTimeoutRef.current = null;
    }, 4500);
  }

  async function requestActiveCampaignHandoff() {
    if (!supabase || !selectedCampaign) return;
    const recipientIds = Array.from(
      new Set(
        activeCampaignPresenceOthers
          .map((entry) => entry.userId)
          .filter((userId) => typeof userId === "string" && userId.length > 0)
      )
    );
    if (recipientIds.length === 0) return;

    setRequestHandoffPending(true);
    setActiveCampaignPresenceError(null);
    try {
      await Promise.all(
        recipientIds.map((recipientId) =>
          requestCampaignHandoff(
            supabase,
            activeWorkspaceId,
            selectedCampaign.id,
            recipientId
          )
        )
      );
      const recipientsSummary =
        activeCampaignPresenceLabels.length > 0
          ? activeCampaignPresenceLabels.join(", ")
          : `${recipientIds.length} collaborator${
              recipientIds.length === 1 ? "" : "s"
            }`;
      showRequestHandoffNotice(`Handoff request sent to ${recipientsSummary}.`);
    } catch (error) {
      setActiveCampaignPresenceError(normalizeHandoffErrorMessage(error));
    } finally {
      setRequestHandoffPending(false);
    }
  }

  async function respondToIncomingHandoffRequest(
    request: CloudIncomingHandoffRequest,
    action: "accepted" | "declined"
  ) {
    if (!supabase) return;
    setRespondHandoffPendingId(request.id);
    setIncomingHandoffRequestsError(null);
    try {
      await respondCampaignHandoffRequest(supabase, request.id, action);
      setIncomingHandoffRequests((prev) =>
        prev.filter((entry) => entry.id !== request.id)
      );
      if (action === "accepted") {
        if (
          request.workspaceId === activeWorkspaceId &&
          request.campaignId === selectedCampaign?.id
        ) {
          setActiveCampaignHandoffReleased(true);
          if (handoffReleaseTimeoutRef.current) {
            window.clearTimeout(handoffReleaseTimeoutRef.current);
          }
          handoffReleaseTimeoutRef.current = window.setTimeout(() => {
            setActiveCampaignHandoffReleased(false);
            handoffReleaseTimeoutRef.current = null;
          }, 45000);
        }
        await clearCampaignEditorPresence(
          supabase,
          request.workspaceId,
          request.campaignId
        ).catch(() => {
          // noop: best-effort release.
        });
        const requesterLabel = presenceLabelFromIdentity({
          displayName: request.fromDisplayName,
          email: request.fromEmail,
        });
        showRequestHandoffNotice(`Editing handed off to ${requesterLabel}.`);
      }
    } catch (error) {
      setIncomingHandoffRequestsError(normalizeHandoffErrorMessage(error));
    } finally {
      setRespondHandoffPendingId(null);
    }
  }

  // ── Media helpers ──────────────────────────────────────────────

  function revokeMediaUrl(url: string) {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }

  function replaceCampaignMedia(nextCampaignMedia: Record<string, PreviewMedia>) {
    setCampaignMediaMap((prev) => {
      for (const [campaignId, media] of Object.entries(prev)) {
        const next = nextCampaignMedia[campaignId];
        if (media.kind === "none") continue;
        if (!next || next.kind === "none" || next.url !== media.url) {
          revokeMediaUrl(media.url);
        }
      }
      return nextCampaignMedia;
    });
  }

  function collectCampaigns(nextData: AppData): Campaign[] {
    return nextData.clients.flatMap((client) =>
      client.projects.flatMap((project) => project.campaigns)
    );
  }

  function collectRenderableMediaRefs(nextData: AppData): Array<{
    campaignId: string;
    kind: "image" | "video" | null;
    path: string;
  }> {
    const refs: Array<{
      campaignId: string;
      kind: "image" | "video" | null;
      path: string;
    }> = [];
    for (const campaign of collectCampaigns(nextData)) {
      if (!campaign.mediaStoragePath) continue;
      const kind = inferMediaKind(campaign.mediaKind, campaign.mediaMimeType);
      refs.push({
        campaignId: campaign.id,
        kind,
        path: campaign.mediaStoragePath,
      });
    }
    return refs;
  }

  type LocalMediaLookup = {
    byPath: Map<string, LocalMediaAsset>;
    byCampaignId: Map<string, LocalMediaAsset>;
  };

  type TransferredCampaignMedia = {
    mediaStoragePath: string;
    mediaKind: "image" | "video";
    mediaMimeType: string;
  };

  function mediaKindFromCampaign(campaign: Campaign): "image" | "video" | null {
    return inferMediaKind(campaign.mediaKind, campaign.mediaMimeType);
  }

  function mediaFileNameFromPath(path: string | undefined, fallbackKind: "image" | "video"): string {
    const candidate = path?.split("/").pop()?.trim();
    if (candidate) return candidate;
    return fallbackKind === "video" ? "media.mp4" : "media.png";
  }

  async function buildLocalMediaLookup(workspaceId: string): Promise<LocalMediaLookup> {
    const assets = await listLocalMediaAssetsForWorkspace(workspaceId);
    const byPath = new Map<string, LocalMediaAsset>();
    const byCampaignId = new Map<string, LocalMediaAsset>();
    for (const asset of assets) {
      if (asset.storagePath) byPath.set(asset.storagePath, asset);
      if (asset.campaignId) byCampaignId.set(asset.campaignId, asset);
    }
    return { byPath, byCampaignId };
  }

  function localAssetForCampaign(
    lookup: LocalMediaLookup,
    campaign: Campaign
  ): LocalMediaAsset | null {
    if (campaign.mediaStoragePath) {
      const byPath = lookup.byPath.get(campaign.mediaStoragePath);
      if (byPath) return byPath;
    }
    return lookup.byCampaignId.get(campaign.id) ?? null;
  }

  async function persistLocalMediaAssetWithFallback(
    workspaceId: string,
    campaignId: string,
    input: {
      blob: Blob;
      kind: "image" | "video";
      mimeType: string;
      fileName: string;
      preferredStoragePath?: string;
    }
  ): Promise<{ ok: boolean; storagePath: string }> {
    const candidates: string[] = [];
    if (input.preferredStoragePath) candidates.push(input.preferredStoragePath);
    try {
      if (!input.preferredStoragePath) {
        candidates.push(await localMediaStoragePathForBlob(input.blob));
      }
    } catch {
      // Hashing can fail for very large files; fall back to random path.
    }
    candidates.push(fallbackLocalMediaStoragePath());

    for (const storagePath of candidates) {
      const ok = await putLocalMediaAsset(workspaceId, storagePath, {
        campaignId,
        kind: input.kind,
        blob: input.blob,
        mimeType: input.mimeType,
        fileName: input.fileName,
      });
      if (ok) return { ok: true, storagePath };
    }
    return { ok: false, storagePath: "" };
  }

  function applyCampaignMediaUpdate(
    nextData: AppData,
    campaignId: string,
    media: TransferredCampaignMedia
  ): AppData {
    return {
      clients: nextData.clients.map((client) => ({
        ...client,
        projects: client.projects.map((project) => ({
          ...project,
          campaigns: project.campaigns.map((campaign) =>
            campaign.id === campaignId
              ? {
                  ...campaign,
                  mediaStoragePath: media.mediaStoragePath,
                  mediaKind: media.mediaKind,
                  mediaMimeType: media.mediaMimeType,
                  updatedAt: nowIso(),
                }
              : campaign
          ),
        })),
      })),
    };
  }

  async function hydrateLocalMediaForWorkspace(
    workspaceId: string,
    nextData: AppData
  ) {
    const campaigns = collectCampaigns(nextData);
    const assets = await listLocalMediaAssetsForWorkspace(workspaceId);
    if (assets.length === 0) {
      replaceCampaignMedia({});
      return;
    }

    const assetsByPath = new Map<string, (typeof assets)[number]>();
    const assetsByCampaignId = new Map<string, (typeof assets)[number]>();

    for (const asset of assets) {
      if (asset.storagePath) {
        assetsByPath.set(asset.storagePath, asset);
        if (asset.campaignId) {
          assetsByCampaignId.set(asset.campaignId, asset);
        }
        continue;
      }
      if (asset.campaignId) {
        assetsByCampaignId.set(asset.campaignId, asset);
      }
    }

    const nextCampaignMedia: Record<string, PreviewMedia> = {};
    for (const campaign of campaigns) {
      const campaignKind =
        campaign.mediaKind === "video"
          ? "video"
          : campaign.mediaKind === "image"
            ? "image"
            : null;

      if (isLocalMediaStoragePath(campaign.mediaStoragePath)) {
        const asset = assetsByPath.get(campaign.mediaStoragePath);
        if (!asset) continue;
        const kind = campaignKind ?? asset.kind;
        nextCampaignMedia[campaign.id] = {
          kind,
          url: URL.createObjectURL(asset.blob),
        };
        continue;
      }

      const legacyAsset = assetsByCampaignId.get(campaign.id);
      if (!legacyAsset) continue;
      const kind = campaignKind ?? legacyAsset.kind;
      nextCampaignMedia[campaign.id] = {
        kind,
        url: URL.createObjectURL(legacyAsset.blob),
      };
    }
    replaceCampaignMedia(nextCampaignMedia);
  }

  async function hydrateSignedMediaForWorkspace(
    workspaceId: string,
    nextData: AppData
  ) {
    if (!cloudEnabled) return;
    const accessToken = await getSessionAccessToken();
    if (!accessToken) return;
    const campaigns = collectCampaigns(nextData);
    const byCampaign = new Map<string, { path: string; kind: "image" | "video" }>();
    for (const campaign of campaigns) {
      if (!campaign.mediaStoragePath) continue;
      const kind = inferMediaKind(campaign.mediaKind, campaign.mediaMimeType);
      if (!kind) continue;
      byCampaign.set(campaign.id, { path: campaign.mediaStoragePath, kind });
    }
    if (byCampaign.size === 0) {
      replaceCampaignMedia({});
      return;
    }

    const paths = Array.from(new Set(Array.from(byCampaign.values()).map((v) => v.path)));
    const res = await fetch("/api/media/sign-read", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId,
        paths,
      }),
    });
    if (!res.ok) {
      throw new Error("Failed to sign media URLs");
    }
    const json = (await res.json()) as { urls?: Record<string, string> };
    const urlMap = json.urls ?? {};
    const nextCampaignMedia: Record<string, PreviewMedia> = {};
    byCampaign.forEach((value, campaignId) => {
      const signed = urlMap[value.path];
      if (!signed) return;
      nextCampaignMedia[campaignId] = { kind: value.kind, url: signed };
    });
    replaceCampaignMedia(nextCampaignMedia);
  }

  async function getSessionAccessToken(): Promise<string | null> {
    if (session?.access_token) return session.access_token;
    if (!supabase) return null;
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  function setCampaignMedia(campaignId: string, media: PreviewMedia) {
    setCampaignMediaMap((prev) => {
      const cur = prev[campaignId];
      if (cur && cur.kind !== "none" && (media.kind === "none" || cur.url !== media.url)) {
        revokeMediaUrl(cur.url);
      }
      return { ...prev, [campaignId]: media };
    });
  }

  function cleanupCampaignMedia(ids: string[]) {
    setCampaignMediaMap((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const m = next[id];
        if (m && m.kind !== "none") revokeMediaUrl(m.url);
        delete next[id];
      }
      return next;
    });
  }

  async function uploadMediaToCloud(
    campaignId: string,
    file: File
  ): Promise<{ kind: "image" | "video"; url: string; storagePath: string }> {
    if (!supabase) {
      throw new Error("You must be signed in to upload media.");
    }
    const accessToken = await getSessionAccessToken();
    if (!accessToken) {
      throw new Error("You must be signed in to upload media.");
    }
    const mediaKind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";

    const signRes = await fetch("/api/media/sign-upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId: activeWorkspaceId,
        campaignId,
        fileName: file.name,
        contentType: file.type,
      }),
    });
    if (!signRes.ok) {
      throw new Error("Failed to start upload.");
    }
    const signJson = (await signRes.json()) as { path: string; token: string };
    const { path, token } = signJson;
    if (!path || !token) throw new Error("Upload token missing.");

    const uploadRes = await supabase.storage
      .from(process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET || "campaign-media")
      .uploadToSignedUrl(path, token, file);
    if (uploadRes.error) {
      throw uploadRes.error;
    }

    const finalizeRes = await fetch("/api/media/finalize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId: activeWorkspaceId,
        campaignId,
        path,
        mediaKind,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
    if (!finalizeRes.ok) {
      throw new Error("Failed to finalize uploaded media.");
    }

    const readRes = await fetch("/api/media/sign-read", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId: activeWorkspaceId,
        paths: [path],
      }),
    });
    if (!readRes.ok) {
      throw new Error("Failed to fetch media URL.");
    }
    const readJson = (await readRes.json()) as { urls?: Record<string, string> };
    const signedUrl = readJson.urls?.[path];
    if (!signedUrl) {
      throw new Error("Media URL was not generated.");
    }
    return { kind: mediaKind, url: signedUrl, storagePath: path };
  }

  async function uploadBlobToCloudWorkspace(
    workspaceId: string,
    campaignId: string,
    input: {
      blob: Blob;
      fileName: string;
      mimeType: string;
      mediaKind: "image" | "video";
    }
  ): Promise<TransferredCampaignMedia> {
    if (!supabase) {
      throw new Error("You must be signed in to upload media.");
    }
    const accessToken = await getSessionAccessToken();
    if (!accessToken) {
      throw new Error("You must be signed in to upload media.");
    }

    const signRes = await fetch("/api/media/sign-upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId,
        campaignId,
        fileName: input.fileName,
        contentType: input.mimeType,
      }),
    });
    if (!signRes.ok) {
      throw new Error("Failed to start upload.");
    }
    const signJson = (await signRes.json()) as { path: string; token: string };
    const { path, token } = signJson;
    if (!path || !token) throw new Error("Upload token missing.");

    const file = new File([input.blob], input.fileName, { type: input.mimeType });
    const uploadRes = await supabase.storage
      .from(process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET || "campaign-media")
      .uploadToSignedUrl(path, token, file);
    if (uploadRes.error) {
      throw uploadRes.error;
    }

    const finalizeRes = await fetch("/api/media/finalize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId,
        campaignId,
        path,
        mediaKind: input.mediaKind,
        mimeType: input.mimeType,
        sizeBytes: file.size,
      }),
    });
    if (!finalizeRes.ok) {
      throw new Error("Failed to finalize uploaded media.");
    }

    return {
      mediaStoragePath: path,
      mediaKind: input.mediaKind,
      mediaMimeType: input.mimeType,
    };
  }

  async function downloadCloudMediaBlob(
    workspaceId: string,
    storagePath: string,
    fallbackKind: "image" | "video"
  ): Promise<{ blob: Blob; fileName: string }> {
    const accessToken = await getSessionAccessToken();
    if (!accessToken) {
      throw new Error("You must be signed in to move media.");
    }
    const readRes = await fetch("/api/media/sign-read", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId,
        paths: [storagePath],
      }),
    });
    if (!readRes.ok) {
      throw new Error("Failed to fetch media URL.");
    }
    const readJson = (await readRes.json()) as { urls?: Record<string, string> };
    const signedUrl = readJson.urls?.[storagePath];
    if (!signedUrl) {
      throw new Error("Media URL was not generated.");
    }

    const downloadRes = await fetch(signedUrl);
    if (!downloadRes.ok) {
      throw new Error("Failed to download media.");
    }
    const blob = await downloadRes.blob();
    const inferredKind = blob.type.startsWith("video/")
      ? "video"
      : blob.type.startsWith("image/")
        ? "image"
        : fallbackKind;
    const fileName = mediaFileNameFromPath(storagePath, inferredKind);
    return { blob, fileName };
  }

  async function transferCampaignMediaBetweenWorkspaces(
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    sourceCampaign: Campaign,
    targetCampaignId: string,
    sourceLocalLookup?: LocalMediaLookup
  ): Promise<TransferredCampaignMedia | null> {
    if (!sourceCampaign.mediaStoragePath) return null;
    const sourceKind = mediaKindFromCampaign(sourceCampaign);
    if (!sourceKind) return null;

    const sourceWorkspace = workspaces.find((workspace) => workspace.id === sourceWorkspaceId);
    const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
    if (!sourceWorkspace || !targetWorkspace) return null;

    let blob: Blob;
    let mimeType: string;
    let fileName: string;
    let mediaKind: "image" | "video" = sourceKind;

    if (sourceWorkspace.kind === "local") {
      const lookup = sourceLocalLookup ?? (await buildLocalMediaLookup(sourceWorkspaceId));
      const localAsset = localAssetForCampaign(lookup, sourceCampaign);
      if (!localAsset) return null;
      blob = localAsset.blob;
      mimeType =
        localAsset.mimeType ||
        sourceCampaign.mediaMimeType ||
        (localAsset.kind === "video" ? "video/mp4" : "image/png");
      fileName =
        localAsset.fileName || mediaFileNameFromPath(sourceCampaign.mediaStoragePath, localAsset.kind);
      mediaKind = localAsset.kind;
    } else {
      const downloaded = await downloadCloudMediaBlob(
        sourceWorkspaceId,
        sourceCampaign.mediaStoragePath,
        sourceKind
      );
      blob = downloaded.blob;
      mimeType =
        downloaded.blob.type ||
        sourceCampaign.mediaMimeType ||
        (sourceKind === "video" ? "video/mp4" : "image/png");
      fileName = downloaded.fileName;
      mediaKind = mimeType.startsWith("video/") ? "video" : "image";
    }

    if (targetWorkspace.kind === "local") {
      const persisted = await persistLocalMediaAssetWithFallback(targetWorkspaceId, targetCampaignId, {
        blob,
        kind: mediaKind,
        mimeType,
        fileName,
        preferredStoragePath: isLocalMediaStoragePath(sourceCampaign.mediaStoragePath)
          ? sourceCampaign.mediaStoragePath
          : undefined,
      });
      if (!persisted.ok) return null;
      return {
        mediaStoragePath: persisted.storagePath,
        mediaKind,
        mediaMimeType: mimeType,
      };
    }

    return await uploadBlobToCloudWorkspace(targetWorkspaceId, targetCampaignId, {
      blob,
      fileName,
      mimeType,
      mediaKind,
    });
  }

  async function clearCampaignMediaInCloud(campaignId: string): Promise<void> {
    if (!supabase) return;
    const accessToken = await getSessionAccessToken();
    if (!accessToken) return;
    const response = await fetch("/api/media/remove", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        workspaceId: activeWorkspaceId,
        campaignId,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to clear media.");
    }
  }

  async function setMediaFromFile(campaignId: string, file: File) {
    if (activeCampaignEditingLocked && selectedCampaign?.id === campaignId) {
      alert("Another collaborator is editing this ad. Request handoff in the editor to upload media.");
      return;
    }
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      alert("Please choose an image or video file.");
      return;
    }

    if (cloudEnabled && !activeWorkspaceIsLocal) {
      try {
        const uploaded = await uploadMediaToCloud(campaignId, file);
        setCampaignMedia(campaignId, { kind: uploaded.kind, url: uploaded.url });
        setData((prev) => ({
          clients: prev.clients.map((client) => ({
            ...client,
            projects: client.projects.map((project) => ({
              ...project,
              campaigns: project.campaigns.map((campaign) =>
                campaign.id === campaignId
                  ? {
                      ...campaign,
                      mediaStoragePath: uploaded.storagePath,
                      mediaKind: uploaded.kind,
                      mediaMimeType: file.type,
                      updatedAt: nowIso(),
                    }
                  : campaign
              ),
            })),
          })),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        alert(message);
      }
      return;
    }

    const url = URL.createObjectURL(file);
    const mediaKind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const persisted = await persistLocalMediaAssetWithFallback(activeWorkspaceId, campaignId, {
      blob: file,
      kind: mediaKind,
      mimeType: file.type,
      fileName: file.name,
    });
    if (!persisted.ok) {
      console.warn("Failed to persist local media in IndexedDB.");
    }
    setCampaignMedia(campaignId, { kind: mediaKind, url });
    const effectiveStoragePath = persisted.ok ? persisted.storagePath : "";
    if (!persisted.ok) {
      alert("Local media could not be persisted to IndexedDB. The media will be visible for now, but may be lost on refresh.");
    }
    const nextData: AppData = {
      clients: data.clients.map((client) => ({
        ...client,
        projects: client.projects.map((project) => ({
          ...project,
          campaigns: project.campaigns.map((campaign) =>
            campaign.id === campaignId
              ? {
                  ...campaign,
                  mediaStoragePath: effectiveStoragePath,
                  mediaKind,
                  mediaMimeType: file.type,
                  updatedAt: nowIso(),
                }
              : campaign
          ),
        })),
      })),
    };
    setData(nextData);
    if (!cloudEnabled || activeWorkspaceIsLocal) {
      void setLocalWorkspaceState(activeWorkspaceId, {
        data: nextData,
        selection,
        level: selectionLevel,
      });
    }
  }

  function pickPreviewMedia() {
    mediaInputRef.current?.click();
  }

  function onPreviewFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && selectedCampaign) {
      void setMediaFromFile(selectedCampaign.id, file);
    }
    e.target.value = "";
  }

  function onPreviewDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && selectedCampaign) {
      void setMediaFromFile(selectedCampaign.id, file);
    }
  }

  function onPreviewDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  // ── Workspace management ───────────────────────────────────────

  async function getWorkspaceDataForTransfer(
    workspaceId: string
  ): Promise<AppData | null> {
    if (workspaceId === activeWorkspaceId) return data;
    const cached = workspaceTreeDataRef.current[workspaceId];
    if (cached) return cached;
    return await loadWorkspaceDataForTree(workspaceId, true);
  }

  async function persistWorkspaceStateSnapshot(
    workspaceId: string,
    nextData: AppData,
    nextSelection: Selection,
    nextLevel: SelectionLevel
  ): Promise<void> {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) return;

    if (workspace.kind === "local") {
      await setLocalWorkspaceState(workspaceId, {
        data: nextData,
        selection: nextSelection,
        level: nextLevel,
      });
      return;
    }

    if (cloudEnabled && supabase && authUser) {
      const expectedRevision =
        typeof workspace.revision === "number" ? workspace.revision : 0;
      try {
        const saved = await saveWorkspaceData(
          supabase,
          workspaceId,
          nextData as CloudAppData,
          authUser.id,
          expectedRevision
        );
        setCloudDataSignature(workspaceId, nextData);
        setWorkspaceRevision(workspaceId, saved.revision);
        clearWorkspaceConflict(workspaceId);
      } catch (error) {
        if (error instanceof CloudWorkspaceConflictError) {
          const resolved = await resolveStaleWorkspaceConflict(
            workspaceId,
            nextData
          );
          if (resolved) return;
          setWorkspaceConflict(workspaceId, error.message);
          return;
        }
        throw error;
      }
    }
  }

  async function switchWorkspace(
    wsId: string,
    nextLevel?: SelectionLevel,
    nextSelection?: Selection
  ) {
    setShowUserSettings(false);
    if (wsId === activeWorkspaceId) {
      if (nextSelection) setSelection(coerceSelection(data, nextSelection));
      if (nextLevel) setSelectionLevel(nextLevel);
      return;
    }
    const target = workspaces.find((w) => w.id === wsId);
    if (!target) return;

    setStorageReady(false);
    try {
      let next: WorkspaceStateSnapshot;
      if (target.kind === "local") {
        next = await loadPrimaryLocalWorkspaceState();
      } else if (cloudEnabled && supabase && authUser) {
        const cloudData = (await loadCloudWorkspaceData(
          supabase,
          wsId
        )) as CloudAppData;
        const normalized = normalizeData(cloudData as AppData);
        next = {
          data: normalized,
          selection: defaultSelection(normalized),
          level: "campaign",
        };
      } else {
        await setLocalWorkspaceState(activeWorkspaceId, {
          data,
          selection,
          level: selectionLevel,
        });
        const indexed = await getLocalWorkspaceState<WorkspaceStateSnapshot>(wsId);
        next =
          indexed && indexed.data
            ? {
                data: normalizeData(indexed.data),
                selection:
                  indexed.selection ?? defaultSelection(normalizeData(indexed.data)),
                level: normalizeSelectionLevel(indexed.level),
              }
            : loadWorkspaceDataFromLocalStorage(wsId);
      }

      const resolvedSelection = coerceSelection(
        next.data,
        nextSelection ?? next.selection
      );
      const resolvedLevel = nextLevel ?? next.level;

      hydratedWorkspaceRef.current = wsId;
      setActiveWorkspaceId(wsId);
      if (target.kind !== "local") {
        setCloudDataSignature(wsId, next.data);
      }
      setData(next.data);
      setWorkspaceTreeData((prev) => ({ ...prev, [wsId]: next.data }));
      setSelection(resolvedSelection);
      setSelectionLevel(resolvedLevel);

      if (target.kind === "local") {
        await hydrateLocalMediaForWorkspace(wsId, next.data);
      } else if (cloudEnabled) {
        await hydrateSignedMediaForWorkspace(wsId, next.data);
      }
    } catch (error) {
      console.error("Failed to switch workspace", error);
      alert("Unable to switch workspace.");
    } finally {
      setStorageReady(true);
    }
  }

  function createWorkspace() {
    if (!canCreateSharedWorkspace) {
      alert("Only owner accounts can create shared workspaces.");
      return;
    }
    if (cloudEnabled && supabase && authUser) {
      const existingShared = workspaces.filter((workspace) => workspace.kind === "organization").length;
      const name = `Shared Workspace ${existingShared + 1}`;
      const wsId = newId("ws");
      void (async () => {
        let ws: Workspace;
        try {
          const created = await createOrganizationWorkspace(supabase, wsId, name);
          ws = {
            id: created.id,
            name: created.name,
            kind: created.kind,
            revision: created.revision,
          };
        } catch (error) {
          console.error("Failed to create workspace", error);
          alert("Failed to create workspace.");
          return;
        }
        const empty = emptyWorkspace();
        setWorkspaces((prev) => [...prev, ws]);
        hydratedWorkspaceRef.current = ws.id;
        replaceCampaignMedia({});
        setActiveWorkspaceId(ws.id);
        setData(empty);
        setSelection(defaultSelection(empty));
        setSelectionLevel("campaign");
      })();
      return;
    }
  }

  function deleteActiveWorkspace() {
    if (activeWorkspace.kind === "local") {
      alert("The Local Workspace cannot be deleted.");
      return;
    }
    if (activeWorkspace.kind === "personal") {
      alert(
        "Your personal cloud workspace cannot be deleted. Create and delete shared workspaces instead."
      );
      return;
    }
    if (activeWorkspace.kind === "organization" && !canDeleteActiveWorkspace) {
      alert("Only workspace owners can delete a shared workspace.");
      return;
    }
    if (!cloudEnabled || !supabase || !authUser) return;

    const targetWorkspaceId = activeWorkspace.id;
    const targetWorkspaceName = activeWorkspace.name;
    const confirmed = window.confirm(
      `Delete workspace "${targetWorkspaceName}"?\n\nThis permanently deletes its clients, projects, ads, and media references.`
    );
    if (!confirmed) return;

    void (async () => {
      try {
        if (activeWorkspace.kind === "organization") {
          const members = await listWorkspaceMembers(supabase, targetWorkspaceId);
          setWorkspaceMembersByWorkspace((prev) => ({
            ...prev,
            [targetWorkspaceId]: members,
          }));
          const currentMembership =
            members.find((member) => member.isCurrentUser) ??
            members.find((member) => member.userId === authUser.id);
          if (currentMembership?.role !== "owner") {
            alert("Only workspace owners can delete a shared workspace.");
            return;
          }
        }

        const { error } = await supabase
          .from("workspaces")
          .delete()
          .eq("id", targetWorkspaceId);
        if (error) {
          throw error;
        }

        setWorkspaceInvitesByWorkspace((prev) => {
          const { [targetWorkspaceId]: _ignored, ...rest } = prev;
          return rest;
        });
        setWorkspaceMembersByWorkspace((prev) => {
          const { [targetWorkspaceId]: _ignored, ...rest } = prev;
          return rest;
        });

        await refreshCloudWorkspaceList();
        await switchWorkspace(LOCAL_WORKSPACE_ID, "workspace");
        await refreshIncomingWorkspaceInviteList();
      } catch (error) {
        console.error("Failed to delete workspace", error);
        const message =
          error instanceof Error ? error.message : "Failed to delete workspace.";
        alert(message);
      }
    })();
  }

  function markImportDone(userId: string) {
    if (typeof window === "undefined") return;
    safeSetLocalStorage(CLOUD_IMPORT_DONE_PREFIX + userId, "1");
  }

  async function importLegacyWorkspaceNow() {
    if (!cloudEnabled || !supabase || !authUser) return;
    const legacy = await getLegacyWorkspaceForImport();
    if (!legacy || legacy.clients.length === 0) {
      markImportDone(authUser.id);
      setShowImportPrompt(false);
      return;
    }

    setImportPending(true);
    try {
      const targetWorkspace =
        activeWorkspaceIsLocal
          ? workspaces.find((w) => w.kind !== "local")
          : activeWorkspace;
      if (!targetWorkspace) {
        alert("No cloud workspace is available for import.");
        return;
      }

      let baseData = data;
      if (targetWorkspace.id !== activeWorkspaceId) {
        const cloudData = (await loadCloudWorkspaceData(
          supabase,
          targetWorkspace.id
        )) as CloudAppData;
        baseData = normalizeData(cloudData as AppData);
      }

      const merged = mergeImportedData(baseData, legacy);
      const expectedRevision =
        typeof targetWorkspace.revision === "number" ? targetWorkspace.revision : 0;
      const saved = await saveWorkspaceData(
        supabase,
        targetWorkspace.id,
        merged as CloudAppData,
        authUser.id,
        expectedRevision
      );
      setCloudDataSignature(targetWorkspace.id, merged);
      setWorkspaceRevision(targetWorkspace.id, saved.revision);
      clearWorkspaceConflict(targetWorkspace.id);
      if (targetWorkspace.id === activeWorkspaceId) {
        setData(merged);
        if (!selection.clientId) {
          setSelection(defaultSelection(merged));
          setSelectionLevel("campaign");
        }
      } else {
        await switchWorkspace(targetWorkspace.id);
      }
      markImportDone(authUser.id);
      setShowImportPrompt(false);
    } catch (error) {
      console.error("Failed to import legacy workspace", error);
      alert("Unable to import local data right now.");
    } finally {
      setImportPending(false);
    }
  }

  function skipLegacyWorkspaceImport() {
    if (!authUser) return;
    markImportDone(authUser.id);
    setShowImportPrompt(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setShowUserSettings(false);
    cloudWorkspaceDataSignatureRef.current = {};
    replaceCampaignMedia({});
    router.replace("/login");
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
    if (activeCampaignEditingLocked) return;
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
    const client: Client = {
      id,
      name: "New Client",
      isVerified: false,
      projects: [project],
    };
    setData((prev) => ({ clients: [...prev.clients, client] }));
    setSelection({ clientId: id, projectId: project.id, campaignId: project.campaigns[0].id });
    setSelectionLevel("client");
    setExpandedClients((prev) => ({ ...prev, [clientExpandKey(id)]: true }));
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
    setExpandedProjects((prev) => ({ ...prev, [projectExpandKey(id)]: true }));
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
      setExpandedClients((prev) => {
        const next = { ...prev };
        delete next[clientExpandKey(clientId)];
        return next;
      });
      setExpandedProjects((prev) => {
        const next = { ...prev };
        for (const project of client.projects) {
          delete next[projectExpandKey(project.id)];
        }
        return next;
      });
      setData((prev) => ({ clients: prev.clients.filter((c) => c.id !== clientId) }));
      if (selection.clientId === clientId) {
        const remaining = data.clients.filter((c) => c.id !== clientId);
        const next = remaining[0];
        setSelection(
          next
            ? {
                clientId: next.id,
                projectId: next.projects[0]?.id ?? "",
                campaignId: next.projects[0]?.campaigns[0]?.id ?? "",
              }
            : { clientId: "", projectId: "", campaignId: "" }
        );
        setSelectionLevel(next ? "client" : "campaign");
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

  function requestDeleteClient(client: Client) {
    const confirmed = window.confirm(
      `Delete client "${client.name}" and all its projects and ads?`
    );
    if (!confirmed) return;
    deleteClient(client.id);
  }

  function requestDeleteProject(clientId: string, project: Project) {
    const confirmed = window.confirm(
      `Delete project "${project.name}" and all its ads?`
    );
    if (!confirmed) return;
    deleteProject(clientId, project.id);
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
    setShowUserSettings(false);
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
  }

  function selectProject(clientId: string, projectId: string) {
    setShowUserSettings(false);
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
  }

  function selectCampaign(clientId: string, projectId: string, campaignId: string) {
    setShowUserSettings(false);
    setSelection({ clientId, projectId, campaignId });
    setSelectionLevel("campaign");
  }

  function copyCurrentCampaignLink() {
    const link = campaignLinkForSelection(activeWorkspaceId, selection);
    if (!link) return;
    copyTextWithFeedback(link, () => {
      setCopyLinkFlash(true);
      setTimeout(() => setCopyLinkFlash(false), 1200);
    });
  }

  function toggleWorkspace(workspaceId: string) {
    const key = workspaceExpandKey(workspaceId);
    const nextExpanded = !(expandedWorkspaces[key] ?? true);
    setExpandedWorkspaces((prev) => ({
      ...prev,
      [key]: nextExpanded,
    }));
    if (nextExpanded) {
      void loadWorkspaceDataForTree(workspaceId);
    }
  }

  function toggleClient(clientId: string, workspaceId = activeWorkspaceId) {
    const key = clientExpandKey(clientId, workspaceId);
    setExpandedClients((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }

  function toggleProject(projectId: string, workspaceId = activeWorkspaceId) {
    const key = projectExpandKey(projectId, workspaceId);
    setExpandedProjects((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }

  function resolveNameConflictOrCancel(args: {
    entityLabel: "Project" | "Ad";
    sourceName: string;
    existingNames: string[];
    destinationLabel: string;
    mode?: DragDropMode;
  }): string | null {
    const preferredName = args.sourceName.trim() || (args.entityLabel === "Project" ? "New Project" : "New Ad");
    const hasConflict = args.existingNames.some(
      (name) => normalizeNameKey(name) === normalizeNameKey(preferredName)
    );
    if (!hasConflict) return preferredName;
    const renamed = uniqueNameWithCopySuffix(preferredName, args.existingNames);
    const action = (args.mode ?? dragDropMode) === "copy" ? "copy" : "move";
    const confirmed = window.confirm(
      `A ${args.entityLabel.toLowerCase()} named "${preferredName}" already exists in ${args.destinationLabel}. ${action === "copy" ? "Copy" : "Move"} it as "${renamed}"?`
    );
    if (!confirmed) return null;
    return renamed;
  }

  function dragDropModeFromDragEvent(event: React.DragEvent): DragDropMode {
    return event.altKey ? "copy" : dragDropMode;
  }

  function readCampaignDragPayload(e: React.DragEvent): CampaignDragPayload | null {
    const raw =
      e.dataTransfer.getData("application/x-socialize-campaign") ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CampaignDragPayload;
      if (
        typeof parsed?.campaignId !== "string" ||
        typeof parsed?.sourceClientId !== "string" ||
        typeof parsed?.sourceProjectId !== "string"
      ) {
        return null;
      }
      return {
        sourceWorkspaceId:
          typeof parsed.sourceWorkspaceId === "string"
            ? parsed.sourceWorkspaceId
            : activeWorkspaceId,
        campaignId: parsed.campaignId,
        sourceClientId: parsed.sourceClientId,
        sourceProjectId: parsed.sourceProjectId,
      };
    } catch {
      return null;
    }
  }

  function readProjectDragPayload(e: React.DragEvent): ProjectDragPayload | null {
    const raw =
      e.dataTransfer.getData("application/x-socialize-project") ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ProjectDragPayload;
      if (
        typeof parsed?.sourceWorkspaceId !== "string" ||
        typeof parsed?.sourceClientId !== "string" ||
        typeof parsed?.sourceProjectId !== "string"
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function onCampaignDragStart(
    e: React.DragEvent<HTMLDivElement>,
    payload: CampaignDragPayload
  ) {
    e.stopPropagation();
    const serialized = JSON.stringify(payload);
    e.dataTransfer.setData("application/x-socialize-campaign", serialized);
    e.dataTransfer.setData("text/plain", serialized);
    e.dataTransfer.effectAllowed = "copyMove";
    setDraggingCampaignId(payload.campaignId);
    setDraggingCampaignPayload(payload);
  }

  function onCampaignDragEnd() {
    setDraggingCampaignId(null);
    setDraggingCampaignPayload(null);
    setCampaignDropTarget(null);
    setCampaignDropCampaignTarget(null);
    setCampaignDropCampaignPosition("before");
  }

  function onProjectDragStart(
    e: React.DragEvent<HTMLDivElement>,
    payload: ProjectDragPayload
  ) {
    e.stopPropagation();
    const serialized = JSON.stringify(payload);
    e.dataTransfer.setData("application/x-socialize-project", serialized);
    e.dataTransfer.setData("text/plain", serialized);
    e.dataTransfer.effectAllowed = "copyMove";
    setDraggingProjectPayload(payload);
  }

  function onProjectDragEnd() {
    setDraggingProjectPayload(null);
    setProjectDropWorkspaceId(null);
  }

  function onWorkspaceProjectDragOver(
    e: React.DragEvent<HTMLDivElement>,
    targetWorkspaceId: string
  ) {
    const payload = draggingProjectPayload ?? readProjectDragPayload(e);
    if (!payload) return;
    const mode = dragDropModeFromDragEvent(e);
    if (payload.sourceWorkspaceId === targetWorkspaceId && mode === "move") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = mode === "copy" ? "copy" : "move";
    setProjectDropWorkspaceId(targetWorkspaceId);
  }

  async function moveProjectAcrossWorkspaces(
    sourceWorkspaceId: string,
    sourceClientId: string,
    sourceProjectId: string,
    targetWorkspaceId: string,
    mode: DragDropMode = dragDropMode
  ): Promise<void> {
    const isCopyMode = mode === "copy";
    if (sourceWorkspaceId === targetWorkspaceId && !isCopyMode) return;

    const sourceData = await getWorkspaceDataForTransfer(sourceWorkspaceId);
    const targetData =
      sourceWorkspaceId === targetWorkspaceId
        ? sourceData
        : await getWorkspaceDataForTransfer(targetWorkspaceId);
    if (!sourceData || !targetData) return;

    const sourceClient = sourceData.clients.find(
      (client) => client.id === sourceClientId
    );
    const sourceProject = sourceClient?.projects.find(
      (project) => project.id === sourceProjectId
    );
    if (!sourceClient || !sourceProject) return;

    const normalizedSourceName = sourceClient.name.trim().toLowerCase();
    const existingTargetClient = targetData.clients.find(
      (client) => client.name.trim().toLowerCase() === normalizedSourceName
    );
    const targetClientId = existingTargetClient?.id ?? newId("cl");
    const resolvedProjectName = resolveNameConflictOrCancel({
      entityLabel: "Project",
      sourceName: sourceProject.name,
      existingNames: existingTargetClient?.projects.map((project) => project.name) ?? [],
      destinationLabel: existingTargetClient
        ? `client "${existingTargetClient.name}"`
        : `new client "${sourceClient.name}"`,
      mode,
    });
    if (!resolvedProjectName) return;

    const sourceWorkspace = workspaces.find(
      (workspace) => workspace.id === sourceWorkspaceId
    );
    const targetWorkspace = workspaces.find(
      (workspace) => workspace.id === targetWorkspaceId
    );
    const sourceLocalLookup =
      sourceWorkspace?.kind === "local"
        ? await buildLocalMediaLookup(sourceWorkspaceId)
        : undefined;

    const movedProject: Project = {
      ...sourceProject,
      id: newId("prj"),
      name: resolvedProjectName,
      campaigns: sourceProject.campaigns.map((campaign) => ({
        ...campaign,
        id: newId("cmp"),
        mediaStoragePath: "",
        mediaKind: "none",
        mediaMimeType: "",
        updatedAt: nowIso(),
      })),
    };

    const removedCampaignIds = sourceProject.campaigns.map((campaign) => campaign.id);

    const sourceNext: AppData = {
      clients: isCopyMode
        ? sourceData.clients
        : sourceData.clients.map((client) => {
            if (client.id !== sourceClientId) return client;
            return {
              ...client,
              projects: client.projects.filter((project) => project.id !== sourceProjectId),
            };
          }),
    };

    const targetNext: AppData = existingTargetClient
      ? {
          clients: targetData.clients.map((client) =>
            client.id !== existingTargetClient.id
              ? client
              : { ...client, projects: [...client.projects, movedProject] }
          ),
        }
      : {
          clients: [
            ...targetData.clients,
            {
              id: targetClientId,
              name: sourceClient.name,
              isVerified: sourceClient.isVerified,
              profileImageDataUrl: sourceClient.profileImageDataUrl,
              projects: [movedProject],
            },
          ],
        };

    const sourceSelection = defaultSelection(sourceNext);
    const targetSelection: Selection = {
      clientId: targetClientId,
      projectId: movedProject.id,
      campaignId: movedProject.campaigns[0]?.id ?? "",
    };

    if (sourceWorkspaceId === targetWorkspaceId) {
      try {
        await persistWorkspaceStateSnapshot(
          targetWorkspaceId,
          targetNext,
          targetSelection,
          targetSelection.campaignId ? "campaign" : "project"
        );
      } catch (error) {
        console.error("Failed to persist copied project", error);
        alert("Unable to copy project.");
        return;
      }
    } else {
      const targetOriginalSelection = defaultSelection(targetData);
      try {
        await persistWorkspaceStateSnapshot(
          targetWorkspaceId,
          targetNext,
          targetSelection,
          targetSelection.campaignId ? "campaign" : "project"
        );
        try {
          if (!isCopyMode) {
            await persistWorkspaceStateSnapshot(
              sourceWorkspaceId,
              sourceNext,
              sourceSelection,
              selectionLevelFromSelection(sourceSelection)
            );
          }
        } catch (sourcePersistError) {
          try {
            await persistWorkspaceStateSnapshot(
              targetWorkspaceId,
              targetData,
              targetOriginalSelection,
              selectionLevelFromSelection(targetOriginalSelection)
            );
          } catch (rollbackError) {
            console.error(
              "Failed to rollback target workspace after project transfer failure",
              rollbackError
            );
          }
          throw sourcePersistError;
        }
      } catch (error) {
        console.error("Failed to persist moved project", error);
        alert(isCopyMode ? "Unable to copy project." : "Unable to move project between workspaces.");
        return;
      }
    }

    let targetFinal = targetNext;
    let failedMediaTransfers = 0;
    let successfulMediaTransfers = 0;
    const mediaTransferCount = sourceProject.campaigns.reduce(
      (count, campaign) => (campaign.mediaStoragePath ? count + 1 : count),
      0
    );
    if (mediaTransferCount > 0) {
      beginTransferUploadIndicator(targetWorkspaceId, movedProject.id, mediaTransferCount);
      try {
        for (let i = 0; i < sourceProject.campaigns.length; i += 1) {
          const sourceCampaign = sourceProject.campaigns[i];
          const movedCampaign = movedProject.campaigns[i];
          if (!sourceCampaign || !movedCampaign) continue;
          if (!sourceCampaign.mediaStoragePath) continue;

          try {
            const transferred = await transferCampaignMediaBetweenWorkspaces(
              sourceWorkspaceId,
              targetWorkspaceId,
              sourceCampaign,
              movedCampaign.id,
              sourceLocalLookup
            );
            if (!transferred) {
              failedMediaTransfers += 1;
              continue;
            }
            targetFinal = applyCampaignMediaUpdate(targetFinal, movedCampaign.id, transferred);
            successfulMediaTransfers += 1;
          } catch (error) {
            console.warn("Failed to transfer campaign media during project move", error);
            failedMediaTransfers += 1;
          }
        }
      } finally {
        endTransferUploadIndicator(targetWorkspaceId, movedProject.id, mediaTransferCount);
      }
    }

    if (successfulMediaTransfers > 0 && targetWorkspace?.kind === "local") {
      try {
        await persistWorkspaceStateSnapshot(
          targetWorkspaceId,
          targetFinal,
          targetSelection,
          targetSelection.campaignId ? "campaign" : "project"
        );
      } catch (error) {
        console.error("Failed to persist transferred project media", error);
        alert("Project moved, but some media metadata could not be saved.");
        targetFinal = targetNext;
      }
    }

    if (sourceWorkspaceId === targetWorkspaceId) {
      setWorkspaceTreeData((prev) => ({
        ...prev,
        [targetWorkspaceId]: targetFinal,
      }));
      if (activeWorkspaceId === targetWorkspaceId) {
        setData(targetFinal);
        setSelection(targetSelection);
        setSelectionLevel("project");
      }
    } else {
      setWorkspaceTreeData((prev) => ({
        ...prev,
        [sourceWorkspaceId]: sourceNext,
        [targetWorkspaceId]: targetFinal,
      }));
      if (!isCopyMode) {
        cleanupCampaignMedia(removedCampaignIds);
      }

      if (sourceWorkspaceId === activeWorkspaceId && !isCopyMode) {
        const sourceLevel: SelectionLevel = selectionLevelFromSelection(sourceSelection);
        setData(sourceNext);
        if (selection.projectId === sourceProjectId) {
          setSelection(sourceSelection);
          setSelectionLevel(sourceLevel);
        }
      } else if (targetWorkspaceId === activeWorkspaceId) {
        setData(targetFinal);
        setSelection(targetSelection);
        setSelectionLevel("project");
      }
    }

    if (successfulMediaTransfers > 0 && targetWorkspaceId === activeWorkspaceId) {
      if (targetWorkspace?.kind === "local") {
        try {
          await hydrateLocalMediaForWorkspace(targetWorkspaceId, targetFinal);
        } catch (error) {
          console.warn("Failed to hydrate local media after project move", error);
        }
      } else if (cloudEnabled) {
        try {
          await hydrateSignedMediaForWorkspace(targetWorkspaceId, targetFinal);
        } catch (error) {
          console.warn("Failed to hydrate cloud media after project move", error);
        }
      }
    }

    if (failedMediaTransfers > 0) {
      alert(
        `Project ${isCopyMode ? "copied" : "moved"}. ${failedMediaTransfers} media file${failedMediaTransfers === 1 ? "" : "s"} could not be transferred; please re-upload in the destination workspace.`
      );
    }
  }

  async function onWorkspaceProjectDrop(
    e: React.DragEvent<HTMLDivElement>,
    targetWorkspaceId: string
  ) {
    const payload = draggingProjectPayload ?? readProjectDragPayload(e);
    setProjectDropWorkspaceId(null);
    if (!payload) return;
    e.preventDefault();
    const mode = dragDropModeFromDragEvent(e);
    await moveProjectAcrossWorkspaces(
      payload.sourceWorkspaceId,
      payload.sourceClientId,
      payload.sourceProjectId,
      targetWorkspaceId,
      mode
    );
  }

  function onProjectCampaignDragOver(
    e: React.DragEvent<HTMLDivElement>,
    targetWorkspaceId: string,
    targetProjectId: string
  ) {
    const payload = draggingCampaignPayload ?? readCampaignDragPayload(e);
    if (!payload) return;
    if (
      payload.sourceWorkspaceId === targetWorkspaceId &&
      payload.sourceProjectId === targetProjectId
    ) {
      return;
    }
    e.preventDefault();
    const mode = dragDropModeFromDragEvent(e);
    e.dataTransfer.dropEffect = mode === "copy" ? "copy" : "move";
    setCampaignDropCampaignTarget(null);
    setCampaignDropCampaignPosition("before");
    setCampaignDropTarget(campaignDropTargetKey(targetProjectId, targetWorkspaceId));
  }

  function reorderCampaignList(
    campaigns: Campaign[],
    sourceCampaignId: string,
    targetCampaignId: string,
    position: DropInsertPosition
  ): Campaign[] {
    const sourceIndex = campaigns.findIndex((campaign) => campaign.id === sourceCampaignId);
    const targetIndex = campaigns.findIndex((campaign) => campaign.id === targetCampaignId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return campaigns;

    const moved = campaigns[sourceIndex];
    if (!moved) return campaigns;
    const remaining = campaigns.filter((campaign) => campaign.id !== sourceCampaignId);
    const adjustedTargetIndex = remaining.findIndex(
      (campaign) => campaign.id === targetCampaignId
    );
    if (adjustedTargetIndex < 0) return campaigns;
    const insertIndex =
      position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
    const next = [...remaining];
    next.splice(insertIndex, 0, moved);
    return next;
  }

  function insertCampaignAtTarget(
    campaigns: Campaign[],
    campaign: Campaign,
    targetCampaignId: string | null,
    position: DropInsertPosition
  ): Campaign[] {
    if (!targetCampaignId) return [...campaigns, campaign];
    const index = campaigns.findIndex((candidate) => candidate.id === targetCampaignId);
    if (index < 0) return [...campaigns, campaign];
    const insertIndex = position === "after" ? index + 1 : index;
    const next = [...campaigns];
    next.splice(insertIndex, 0, campaign);
    return next;
  }

  async function reorderCampaignWithinProject(
    workspaceId: string,
    clientId: string,
    projectId: string,
    sourceCampaignId: string,
    targetCampaignId: string,
    position: DropInsertPosition
  ) {
    if (sourceCampaignId === targetCampaignId && position === "before") return;
    const workspaceData = await getWorkspaceDataForTransfer(workspaceId);
    if (!workspaceData) return;

    let changed = false;
    const nextData: AppData = {
      clients: workspaceData.clients.map((client) => {
        if (client.id !== clientId) return client;
        return {
          ...client,
          projects: client.projects.map((project) => {
            if (project.id !== projectId) return project;
            const reordered = reorderCampaignList(
              project.campaigns,
              sourceCampaignId,
              targetCampaignId,
              position
            );
            if (reordered !== project.campaigns) {
              changed = true;
            }
            return { ...project, campaigns: reordered };
          }),
        };
      }),
    };

    if (!changed) return;

    const nextSelection =
      workspaceId === activeWorkspaceId
        ? coerceSelection(nextData, selection)
        : defaultSelection(nextData);
    const nextLevel =
      workspaceId === activeWorkspaceId
        ? selectionLevelFromSelection(nextSelection)
        : selectionLevelFromSelection(nextSelection);

    try {
      await persistWorkspaceStateSnapshot(
        workspaceId,
        nextData,
        nextSelection,
        nextLevel
      );
    } catch (error) {
      console.error("Failed to persist reordered campaigns", error);
      alert("Unable to reorder ads.");
      return;
    }

    setWorkspaceTreeData((prev) => ({ ...prev, [workspaceId]: nextData }));
    if (workspaceId === activeWorkspaceId) {
      setData(nextData);
      setSelection(nextSelection);
      setSelectionLevel(nextLevel);
    }
  }

  function onCampaignRowDragOver(
    e: React.DragEvent<HTMLDivElement>,
    targetWorkspaceId: string,
    targetCampaignId: string
  ) {
    const payload = draggingCampaignPayload ?? readCampaignDragPayload(e);
    if (!payload) return;
    if (
      payload.sourceWorkspaceId === targetWorkspaceId &&
      payload.campaignId === targetCampaignId
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const mode = dragDropModeFromDragEvent(e);
    e.dataTransfer.dropEffect = mode === "copy" ? "copy" : "move";
    const position = dropInsertPositionFromEvent(e);
    setCampaignDropTarget(null);
    setCampaignDropCampaignTarget(
      campaignRowDropTargetKey(targetCampaignId, targetWorkspaceId)
    );
    setCampaignDropCampaignPosition(position);
  }

  async function onCampaignRowDrop(
    e: React.DragEvent<HTMLDivElement>,
    targetWorkspaceId: string,
    targetClientId: string,
    targetProjectId: string,
    targetCampaignId: string
  ) {
    const payload = draggingCampaignPayload ?? readCampaignDragPayload(e);
    setCampaignDropCampaignTarget(null);
    setCampaignDropTarget(null);
    const position = campaignDropCampaignPosition;
    setCampaignDropCampaignPosition("before");
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = dragDropModeFromDragEvent(e);

    if (
      mode === "move" &&
      payload.sourceWorkspaceId === targetWorkspaceId &&
      payload.sourceClientId === targetClientId &&
      payload.sourceProjectId === targetProjectId
    ) {
      await reorderCampaignWithinProject(
        targetWorkspaceId,
        targetClientId,
        targetProjectId,
        payload.campaignId,
        targetCampaignId,
        position
      );
      return;
    }

    await moveCampaignAcrossWorkspaces(
      payload.sourceWorkspaceId,
      payload.sourceClientId,
      payload.sourceProjectId,
      payload.campaignId,
      targetWorkspaceId,
      targetClientId,
      targetProjectId,
      targetCampaignId,
      position,
      mode
    );
  }

  async function moveCampaignAcrossWorkspaces(
    sourceWorkspaceId: string,
    sourceClientId: string,
    sourceProjectId: string,
    campaignId: string,
    targetWorkspaceId: string,
    targetClientId: string,
    targetProjectId: string,
    targetCampaignId: string | null = null,
    targetPosition: DropInsertPosition = "before",
    mode: DragDropMode = dragDropMode
  ) {
    const isCopyMode = mode === "copy";
    const sourceData = await getWorkspaceDataForTransfer(sourceWorkspaceId);
    if (!sourceData) return;
    const targetData =
      sourceWorkspaceId === targetWorkspaceId
        ? sourceData
        : await getWorkspaceDataForTransfer(targetWorkspaceId);
    if (!targetData) return;

    if (
      !isCopyMode &&
      sourceWorkspaceId === targetWorkspaceId &&
      sourceProjectId === targetProjectId
    ) {
      return;
    }

    const sourceClient = sourceData.clients.find((client) => client.id === sourceClientId);
    const sourceProject = sourceClient?.projects.find((project) => project.id === sourceProjectId);
    const sourceCampaign = sourceProject?.campaigns.find(
      (campaign) => campaign.id === campaignId
    );
    if (!sourceClient || !sourceProject || !sourceCampaign) return;

    const targetClient = targetData.clients.find((client) => client.id === targetClientId);
    const targetProject = targetClient?.projects.find((project) => project.id === targetProjectId);
    if (!targetClient || !targetProject) return;

    const resolvedCampaignName = resolveNameConflictOrCancel({
      entityLabel: "Ad",
      sourceName: sourceCampaign.name,
      existingNames: targetProject.campaigns.map((campaign) => campaign.name),
      destinationLabel: `project "${targetProject.name}"`,
      mode,
    });
    if (!resolvedCampaignName) return;

    const sourceWorkspace = workspaces.find(
      (workspace) => workspace.id === sourceWorkspaceId
    );
    const targetWorkspace = workspaces.find(
      (workspace) => workspace.id === targetWorkspaceId
    );

    const movedCampaign: Campaign = {
      ...sourceCampaign,
      id:
        sourceWorkspaceId === targetWorkspaceId && !isCopyMode
          ? sourceCampaign.id
          : newId("cmp"),
      name: resolvedCampaignName,
      mediaStoragePath:
        sourceWorkspaceId === targetWorkspaceId && !isCopyMode
          ? sourceCampaign.mediaStoragePath
          : "",
      mediaKind:
        sourceWorkspaceId === targetWorkspaceId && !isCopyMode
          ? sourceCampaign.mediaKind
          : "none",
      mediaMimeType:
        sourceWorkspaceId === targetWorkspaceId && !isCopyMode
          ? sourceCampaign.mediaMimeType
          : "",
      updatedAt: nowIso(),
    };

    const sourceNext: AppData = {
      clients: isCopyMode
        ? sourceData.clients
        : sourceData.clients.map((client) => {
            if (client.id !== sourceClientId) return client;
            return {
              ...client,
              projects: client.projects.map((project) =>
                project.id !== sourceProjectId
                  ? project
                  : {
                      ...project,
                      campaigns: project.campaigns.filter((campaign) => campaign.id !== campaignId),
                    }
              ),
            };
          }),
    };

    const targetBaseData =
      sourceWorkspaceId === targetWorkspaceId && !isCopyMode ? sourceNext : targetData;
    const targetNext: AppData = {
      clients: targetBaseData.clients.map((client) => {
        if (client.id !== targetClientId) return client;
        return {
          ...client,
          projects: client.projects.map((project) =>
            project.id !== targetProjectId
              ? project
              : {
                  ...project,
                  campaigns: insertCampaignAtTarget(
                    project.campaigns,
                    movedCampaign,
                    targetCampaignId,
                    targetPosition
                  ),
                }
          ),
        };
      }),
    };

    const sourceSelection = defaultSelection(sourceNext);
    const targetSelection: Selection = {
      clientId: targetClientId,
      projectId: targetProjectId,
      campaignId: movedCampaign.id,
    };

    if (sourceWorkspaceId === targetWorkspaceId) {
      try {
        await persistWorkspaceStateSnapshot(
          targetWorkspaceId,
          targetNext,
          targetSelection,
          "campaign"
        );
      } catch (error) {
        console.error("Failed to persist ad transfer", error);
        alert(isCopyMode ? "Unable to copy ad." : "Unable to move ad.");
        return;
      }
    } else {
      const targetOriginalSelection = defaultSelection(targetData);
      try {
        await persistWorkspaceStateSnapshot(
          targetWorkspaceId,
          targetNext,
          targetSelection,
          "campaign"
        );
        try {
          if (!isCopyMode) {
            await persistWorkspaceStateSnapshot(
              sourceWorkspaceId,
              sourceNext,
              sourceSelection,
              selectionLevelFromSelection(sourceSelection)
            );
          }
        } catch (sourcePersistError) {
          try {
            await persistWorkspaceStateSnapshot(
              targetWorkspaceId,
              targetData,
              targetOriginalSelection,
              selectionLevelFromSelection(targetOriginalSelection)
            );
          } catch (rollbackError) {
            console.error("Failed to rollback target workspace after ad transfer failure", rollbackError);
          }
          throw sourcePersistError;
        }
      } catch (error) {
        console.error("Failed to persist ad transfer", error);
        alert(isCopyMode ? "Unable to copy ad between workspaces." : "Unable to move ad between workspaces.");
        return;
      }
    }

    let targetFinal = targetNext;
    let failedMediaTransfer = false;
    const needsMediaTransfer =
      Boolean(sourceCampaign.mediaStoragePath) &&
      (!movedCampaign.mediaStoragePath ||
        movedCampaign.mediaStoragePath !== sourceCampaign.mediaStoragePath);
    if (needsMediaTransfer && sourceCampaign.mediaStoragePath) {
      beginTransferUploadIndicator(targetWorkspaceId, targetProjectId);
      try {
        const sourceLocalLookup =
          sourceWorkspace?.kind === "local"
            ? await buildLocalMediaLookup(sourceWorkspaceId)
            : undefined;
        const transferred = await transferCampaignMediaBetweenWorkspaces(
          sourceWorkspaceId,
          targetWorkspaceId,
          sourceCampaign,
          movedCampaign.id,
          sourceLocalLookup
        );
        if (transferred) {
          targetFinal = applyCampaignMediaUpdate(targetFinal, movedCampaign.id, transferred);
          if (targetWorkspace?.kind === "local") {
            await persistWorkspaceStateSnapshot(
              targetWorkspaceId,
              targetFinal,
              targetSelection,
              "campaign"
            );
          }
        } else {
          failedMediaTransfer = true;
        }
      } catch (error) {
        console.warn("Failed to transfer campaign media during campaign move", error);
        if (targetWorkspace?.kind === "local") {
          targetFinal = targetNext;
        }
        failedMediaTransfer = true;
      } finally {
        endTransferUploadIndicator(targetWorkspaceId, targetProjectId);
      }
    }

    if (sourceWorkspaceId === targetWorkspaceId) {
      setWorkspaceTreeData((prev) => ({
        ...prev,
        [targetWorkspaceId]: targetFinal,
      }));
    } else {
      setWorkspaceTreeData((prev) => ({
        ...prev,
        [sourceWorkspaceId]: sourceNext,
        [targetWorkspaceId]: targetFinal,
      }));
    }
    setExpandedClients((prev) => ({
      ...prev,
      [clientExpandKey(targetClientId, targetWorkspaceId)]: true,
    }));
    setExpandedProjects((prev) => ({
      ...prev,
      [projectExpandKey(targetProjectId, targetWorkspaceId)]: true,
    }));
    if (!isCopyMode && sourceWorkspaceId !== targetWorkspaceId) {
      cleanupCampaignMedia([campaignId]);
    }

    if (sourceWorkspaceId === targetWorkspaceId) {
      if (activeWorkspaceId === targetWorkspaceId) {
        setData(targetFinal);
        setSelection(targetSelection);
        setSelectionLevel("campaign");
      }
    } else if (sourceWorkspaceId === activeWorkspaceId && !isCopyMode) {
      setData(sourceNext);
      if (selection.campaignId === campaignId) {
        setSelection(sourceSelection);
        setSelectionLevel(selectionLevelFromSelection(sourceSelection));
      }
    } else if (targetWorkspaceId === activeWorkspaceId) {
      setData(targetFinal);
      setSelection(targetSelection);
      setSelectionLevel("campaign");
    }

    if (!failedMediaTransfer && needsMediaTransfer && targetWorkspaceId === activeWorkspaceId) {
      if (targetWorkspace?.kind === "local") {
        try {
          await hydrateLocalMediaForWorkspace(targetWorkspaceId, targetFinal);
        } catch (error) {
          console.warn("Failed to hydrate local media after ad move", error);
        }
      } else if (cloudEnabled) {
        try {
          await hydrateSignedMediaForWorkspace(targetWorkspaceId, targetFinal);
        } catch (error) {
          console.warn("Failed to hydrate cloud media after ad move", error);
        }
      }
    }

    if (failedMediaTransfer) {
      alert(
        `Ad ${isCopyMode ? "copied" : "moved"}. Media could not be transferred; please re-upload in the destination workspace.`
      );
    }
  }

  async function onProjectCampaignDrop(
    e: React.DragEvent<HTMLDivElement>,
    targetWorkspaceId: string,
    targetClientId: string,
    targetProjectId: string
  ) {
    const payload = draggingCampaignPayload ?? readCampaignDragPayload(e);
    setCampaignDropTarget(null);
    setCampaignDropCampaignTarget(null);
    setCampaignDropCampaignPosition("before");
    if (!payload) return;
    e.preventDefault();
    const mode = dragDropModeFromDragEvent(e);
    await moveCampaignAcrossWorkspaces(
      payload.sourceWorkspaceId,
      payload.sourceClientId,
      payload.sourceProjectId,
      payload.campaignId,
      targetWorkspaceId,
      targetClientId,
      targetProjectId,
      null,
      "before",
      mode
    );
  }

  // ── Export ─────────────────────────────────────────────────────

  function exportCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, filename);
  }

  function snapshotPreviewVideos(node: HTMLElement): () => void {
    const restores: Array<() => void> = [];
    const videos = Array.from(node.querySelectorAll("video"));

    for (const video of videos) {
      if (!video.videoWidth || !video.videoHeight) continue;

      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = video.videoWidth;
      frameCanvas.height = video.videoHeight;
      const frameCtx = frameCanvas.getContext("2d");
      if (!frameCtx) continue;

      try {
        frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
      } catch {
        continue;
      }

      const image = document.createElement("img");
      const computed = window.getComputedStyle(video);
      image.src = frameCanvas.toDataURL("image/png");
      image.alt = "";
      image.draggable = false;
      image.style.width = computed.width;
      image.style.height = computed.height;
      image.style.display = computed.display === "none" ? "block" : computed.display;
      image.style.objectFit = computed.objectFit;
      image.style.borderRadius = computed.borderRadius;
      image.style.maxWidth = computed.maxWidth;
      image.style.maxHeight = computed.maxHeight;
      image.style.minWidth = computed.minWidth;
      image.style.minHeight = computed.minHeight;
      image.style.flex = computed.flex;
      image.style.alignSelf = computed.alignSelf;
      image.style.verticalAlign = computed.verticalAlign;

      const previousDisplay = video.style.display;
      video.insertAdjacentElement("afterend", image);
      video.style.display = "none";

      restores.push(() => {
        image.remove();
        video.style.display = previousDisplay;
      });
    }

    return () => {
      for (let i = restores.length - 1; i >= 0; i -= 1) {
        restores[i]();
      }
    };
  }

  async function blobToDataUrl(blob: Blob): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("Failed to read blob as data URL."));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob."));
      reader.readAsDataURL(blob);
    });
  }

  async function inlinePreviewImages(node: HTMLElement): Promise<() => void> {
    const restores: Array<() => void> = [];
    const images = Array.from(node.querySelectorAll("img"));

    for (const image of images) {
      const originalSrc = image.getAttribute("src");
      if (!originalSrc || originalSrc.startsWith("data:")) continue;

      try {
        const response = await fetch(image.currentSrc || originalSrc);
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        image.setAttribute("src", dataUrl);
        restores.push(() => image.setAttribute("src", originalSrc));
      } catch (error) {
        console.warn("Failed to inline preview image for DOM export.", originalSrc, error);
      }
    }

    return () => {
      for (let i = restores.length - 1; i >= 0; i -= 1) {
        restores[i]();
      }
    };
  }

  function canvasHasVisiblePixels(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const { width, height } = canvas;
    if (!width || !height) return false;

    const sampleGrid = 12;
    for (let row = 0; row < sampleGrid; row += 1) {
      for (let col = 0; col < sampleGrid; col += 1) {
        const x = Math.min(width - 1, Math.floor((col / (sampleGrid - 1)) * width));
        const y = Math.min(height - 1, Math.floor((row / (sampleGrid - 1)) * height));
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        if (pixel[3] > 0) return true;
      }
    }

    return false;
  }

  async function capturePreviewCanvas(
    node: HTMLElement,
    useForeignObjectRendering: boolean
  ): Promise<HTMLCanvasElement> {
    const rect = node.getBoundingClientRect();
    return await html2canvas(node, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      allowTaint: true,
      logging: false,
      foreignObjectRendering: useForeignObjectRendering,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      windowWidth: Math.round(rect.width),
      windowHeight: Math.round(rect.height),
    });
  }

  async function exportFramePng(): Promise<Blob | null> {
    const node = previewExportRef.current;
    try {
      const canvasBlob = await canvasRef.current?.exportCanvas();
      if (canvasBlob) {
        return canvasBlob;
      }
      if (!node) {
        return await canvasRef.current?.exportCanvas() ?? null;
      }

      const restoreVideos = snapshotPreviewVideos(node);
      const restoreImages = await inlinePreviewImages(node);
      try {
        if ("fonts" in document) {
          await document.fonts.ready;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        let canvas = await capturePreviewCanvas(node, false);
        if (!canvasHasVisiblePixels(canvas)) {
          canvas = await capturePreviewCanvas(node, true);
        }
        return await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((blob) => resolve(blob), "image/png", 1)
        );
      } finally {
        restoreImages();
        restoreVideos();
      }
    } catch (error) {
      console.warn("DOM preview export failed, falling back to canvas export.", error);
      return await canvasRef.current?.exportCanvas() ?? null;
    }
  }

  async function exportCompositedVideoWebm(
    media: PreviewMedia
  ): Promise<Blob | null> {
    if (media.kind !== "video") {
      alert("Composited video export is available when the ad media is a video.");
      return null;
    }

    setIsVideoRecordingExport(true);
    try {
      return await canvasRef.current?.exportVideoWebm() ?? null;
    } catch (error) {
      console.warn("Composited video export failed.", error);
      alert("Unable to export composited video on this browser.");
      return null;
    } finally {
      setIsVideoRecordingExport(false);
    }
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
        if (selectionLevel !== "workspace" && selection.clientId && selection.projectId) {
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey) {
        setOptionCopyMode(true);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (!event.altKey) {
        setOptionCopyMode(false);
      }
    }
    function onBlur() {
      setOptionCopyMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const dragDropMode: DragDropMode = optionCopyMode ? "copy" : "move";

  // ─────────────────────────────────────────────────────────────────────
  // RENDER SECTIONS
  // ─────────────────────────────────────────────────────────────────────

  // ── Sidebar ───────────────────────────────────────────────────

  function renderSidebar() {
    const localWorkspaceGroup =
      workspaces.find((workspace) => workspace.kind === "local") ?? localWorkspace;
    const sharedWorkspaces = workspaces.filter((workspace) => workspace.kind === "organization");

    const activateWorkspaceSelection = (
      workspaceId: string,
      nextSelection: Selection,
      nextLevel: SelectionLevel
    ) => {
      if (workspaceId === activeWorkspaceId) {
        setSelection(coerceSelection(data, nextSelection));
        setSelectionLevel(nextLevel);
        return;
      }
      void switchWorkspace(workspaceId, nextLevel, nextSelection);
    };

    const renderWorkspaceNode = (workspace: Workspace) => {
      const isWorkspaceActive = workspace.id === activeWorkspaceId;
      const workspaceData = isWorkspaceActive
        ? data
        : workspaceTreeData[workspace.id];
      const workspaceLoading = Boolean(workspaceTreeLoading[workspace.id]);
      const workspaceError = workspaceTreeErrors[workspace.id];
      const isWorkspaceExpanded =
        expandedWorkspaces[workspaceExpandKey(workspace.id)] !== false;
      const isWorkspaceSelected = isWorkspaceActive && selectionLevel === "workspace";
      const isWorkspaceBeingRenamed = renamingWorkspaceId === workspace.id;

      return (
        <div key={workspace.id} className="tree-section tree-workspace-section">
          <div
            className={`tree-row tree-row-workspace tree-row-with-toggle${isWorkspaceSelected ? " is-selected" : ""}${projectDropWorkspaceId === workspace.id ? " is-drop-target" : ""}`}
            onClick={(e) => {
              if (isWorkspaceBeingRenamed) return;
              void switchWorkspace(workspace.id, "workspace");
              if ((e.target as HTMLElement).closest(".tree-no-toggle")) return;
              toggleWorkspace(workspace.id);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              beginWorkspaceRename(workspace.id);
            }}
            onDragOver={(e) => onWorkspaceProjectDragOver(e, workspace.id)}
            onDragEnter={(e) => onWorkspaceProjectDragOver(e, workspace.id)}
            onDragLeave={() => {
              if (projectDropWorkspaceId === workspace.id) {
                setProjectDropWorkspaceId(null);
              }
            }}
            onDrop={(e) => {
              void onWorkspaceProjectDrop(e, workspace.id);
            }}
          >
            <button
              className="tree-toggle tree-toggle-start"
              onClick={(e) => {
                e.stopPropagation();
                toggleWorkspace(workspace.id);
              }}
              tabIndex={-1}
            >
              <IconChevron open={isWorkspaceExpanded} />
            </button>
            <span className="tree-node-leading">
              <IconWorkspace kind={workspace.kind} />
            </span>
            {isWorkspaceBeingRenamed ? (
              <input
                autoFocus
                className="ws-inline-input tree-no-toggle"
                value={workspaceRenameDraft}
                onChange={(e) => setWorkspaceRenameDraft(e.target.value)}
                onBlur={() => {
                  void commitWorkspaceRename();
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitWorkspaceRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelWorkspaceRename();
                  }
                }}
              />
            ) : (
              <span className="tree-label tree-label-workspace tree-no-toggle">
                {workspace.name}
              </span>
            )}
            {isWorkspaceActive && (
              <span className="ws-check">
                ✓
              </span>
            )}
          </div>

          <div className={`tree-workspace-children${isWorkspaceExpanded ? " is-open" : ""}`}>
            <div className="tree-workspace-children-inner">
              {workspaceLoading && (
                <div className="tree-workspace-meta">Loading workspace...</div>
              )}
              {!workspaceLoading && workspaceError && (
                <div className="tree-workspace-meta tree-workspace-meta-error">
                  {workspaceError}
                </div>
              )}
              {!workspaceLoading &&
                !workspaceError &&
                (!workspaceData || workspaceData.clients.length === 0) && (
                  <div className="tree-workspace-meta">No clients yet</div>
                )}
              {!workspaceLoading &&
                !workspaceError &&
                workspaceData &&
                workspaceData.clients.map((client) => {
                  const isClientSelected =
                    isWorkspaceActive && selection.clientId === client.id;
                  const isClientExpanded =
                    expandedClients[clientExpandKey(client.id, workspace.id)] !== false;
                  const isEditingClient =
                    isWorkspaceActive &&
                    editingName?.kind === "client" &&
                    editingName.clientId === client.id;

                  return (
                    <div key={client.id} className="tree-section">
                      <div
                        className={`tree-row tree-row-client tree-row-with-toggle${isClientSelected && selectionLevel === "client" ? " is-selected" : ""}`}
                        onClick={(e) => {
                          const project = client.projects[0];
                          const campaign = project?.campaigns[0];
                          activateWorkspaceSelection(
                            workspace.id,
                            {
                              clientId: client.id,
                              projectId: project?.id ?? "",
                              campaignId: campaign?.id ?? "",
                            },
                            "client"
                          );
                          if ((e.target as HTMLElement).closest(".tree-no-toggle")) return;
                          toggleClient(client.id, workspace.id);
                        }}
                        onDoubleClick={() => {
                          if (!isWorkspaceActive) return;
                          beginClientEdit(client.id, client.name);
                        }}
                      >
                        <button
                          className="tree-toggle tree-toggle-start"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleClient(client.id, workspace.id);
                          }}
                          tabIndex={-1}
                        >
                          <IconChevron open={isClientExpanded} />
                        </button>
                        <span className="tree-node-leading">
                          <span className="tree-client-avatar" aria-hidden="true">
                            {client.profileImageDataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={client.profileImageDataUrl} alt="" />
                            ) : (
                              (client.name.trim().slice(0, 1) || "C").toUpperCase()
                            )}
                          </span>
                        </span>
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
                          <span className="tree-label tree-label-client tree-no-toggle">
                            {client.name}
                          </span>
                        )}

                      </div>

                      <div className={`tree-client-children${isClientExpanded ? " is-open" : ""}`}>
                        <div className="tree-client-children-inner">
                          {client.projects.map((project) => {
                            const isProjSelected =
                              isClientSelected && selection.projectId === project.id;
                            const isProjExpanded =
                              expandedProjects[projectExpandKey(project.id, workspace.id)] !== false;
                            const isEditingProj =
                              isWorkspaceActive &&
                              editingName?.kind === "project" &&
                              editingName.projectId === project.id;
                            const isTransferUploading =
                              (uploadingTransferTargets[
                                transferUploadTargetKey(project.id, workspace.id)
                              ] ?? 0) > 0;

                            return (
                              <div key={project.id}>
                                <div
                                  className={`tree-row tree-row-project tree-row-with-toggle${isProjSelected && selectionLevel === "project" ? " is-selected" : ""}${campaignDropTarget === campaignDropTargetKey(project.id, workspace.id) ? " is-drop-target" : ""}`}
                                  onClick={(e) => {
                                    const campaign = project.campaigns[0];
                                    activateWorkspaceSelection(
                                      workspace.id,
                                      {
                                        clientId: client.id,
                                        projectId: project.id,
                                        campaignId: campaign?.id ?? "",
                                      },
                                      "project"
                                    );
                                    if ((e.target as HTMLElement).closest(".tree-no-toggle")) return;
                                    toggleProject(project.id, workspace.id);
                                  }}
                                  onDoubleClick={() => {
                                    if (!isWorkspaceActive) return;
                                    beginProjectEdit(client.id, project.id, project.name);
                                  }}
                                  onDragOver={(e) => {
                                    onProjectCampaignDragOver(e, workspace.id, project.id);
                                  }}
                                  onDragEnter={(e) => {
                                    onProjectCampaignDragOver(e, workspace.id, project.id);
                                  }}
                                  onDragLeave={() => {
                                    if (
                                      campaignDropTarget ===
                                      campaignDropTargetKey(project.id, workspace.id)
                                    ) {
                                      setCampaignDropTarget(null);
                                    }
                                  }}
                                  onDrop={(e) => {
                                    void onProjectCampaignDrop(
                                      e,
                                      workspace.id,
                                      client.id,
                                      project.id
                                    );
                                  }}
                                  draggable={!isEditingProj}
                                  onDragStart={(e) =>
                                    onProjectDragStart(e, {
                                      sourceWorkspaceId: workspace.id,
                                      sourceClientId: client.id,
                                      sourceProjectId: project.id,
                                    })
                                  }
                                  onDragEnd={onProjectDragEnd}
                                >
                                  <button
                                    className="tree-toggle tree-toggle-start"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleProject(project.id, workspace.id);
                                    }}
                                    tabIndex={-1}
                                  >
                                    <IconChevron open={isProjExpanded} />
                                  </button>
                                  <span className="tree-node-leading">
                                    <IconTreeProject />
                                  </span>
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
                                    <span className="tree-label tree-label-project tree-no-toggle">
                                      {project.name}
                                    </span>
                                  )}

                                </div>

                                <div
                                  className={`tree-project-children${isProjExpanded ? " is-open" : ""}`}
                                >
                                  <div className="tree-project-children-inner">
                                    {isTransferUploading && (
                                      <div className="tree-row tree-row-campaign tree-row-uploading">
                                        <span className="tree-label tree-label-campaign">
                                          Uploading...
                                        </span>
                                      </div>
                                    )}
                                    {project.campaigns.map((campaign) => {
                                      const isCampSelected =
                                        isProjSelected && selection.campaignId === campaign.id;
                                      const isEditingCamp =
                                        isWorkspaceActive &&
                                        editingName?.kind === "campaign" &&
                                        editingName.campaignId === campaign.id;

                                      return (
                                        <div
                                          key={campaign.id}
                                          className={`tree-row tree-row-campaign${isCampSelected && selectionLevel === "campaign" ? " is-selected" : ""}${isWorkspaceActive && draggingCampaignId === campaign.id ? " is-dragging" : ""}${
                                            campaignDropCampaignTarget ===
                                            campaignRowDropTargetKey(campaign.id, workspace.id)
                                              ? campaignDropCampaignPosition === "after"
                                                ? " is-insert-after"
                                                : " is-insert-before"
                                              : ""
                                          }`}
                                          onClick={() =>
                                            activateWorkspaceSelection(
                                              workspace.id,
                                              {
                                                clientId: client.id,
                                                projectId: project.id,
                                                campaignId: campaign.id,
                                              },
                                              "campaign"
                                            )
                                          }
                                          onDoubleClick={() => {
                                            if (!isWorkspaceActive) return;
                                            beginCampaignEdit(
                                              client.id,
                                              project.id,
                                              campaign.id,
                                              campaign.name
                                            );
                                          }}
                                          draggable={!isEditingCamp}
                                          onDragStart={(e) => {
                                            onCampaignDragStart(e, {
                                              sourceWorkspaceId: workspace.id,
                                              campaignId: campaign.id,
                                              sourceClientId: client.id,
                                              sourceProjectId: project.id,
                                            });
                                          }}
                                          onDragEnd={onCampaignDragEnd}
                                          onDragOver={(e) =>
                                            onCampaignRowDragOver(
                                              e,
                                              workspace.id,
                                              campaign.id
                                            )
                                          }
                                          onDragEnter={(e) =>
                                            onCampaignRowDragOver(
                                              e,
                                              workspace.id,
                                              campaign.id
                                            )
                                          }
                                          onDragLeave={() => {
                                            if (
                                              campaignDropCampaignTarget ===
                                              campaignRowDropTargetKey(campaign.id, workspace.id)
                                            ) {
                                              setCampaignDropCampaignTarget(null);
                                              setCampaignDropCampaignPosition("before");
                                            }
                                          }}
                                          onDrop={(e) => {
                                            void onCampaignRowDrop(
                                              e,
                                              workspace.id,
                                              client.id,
                                              project.id,
                                              campaign.id
                                            );
                                          }}
                                        >
                                          {isEditingCamp ? (
                                            <input
                                              autoFocus
                                              className="tree-inline-input"
                                              value={editingName!.value}
                                              onChange={(e) =>
                                                setEditingName({
                                                  ...editingName!,
                                                  value: e.target.value,
                                                })
                                              }
                                              onBlur={commitEdit}
                                              onKeyDown={onEditKey}
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          ) : (
                                            <span className="tree-campaign-main">
                                              <span className="tree-node-leading">
                                                <span
                                                  className={`status-dot tree-status-dot status-dot-${campaign.status}`}
                                                />
                                              </span>
                                              <span className="tree-label tree-label-campaign">
                                                {campaign.name}
                                              </span>
                                              <span className="platform-pill">
                                                {platformTreeBadge(campaign.platform)}
                                              </span>
                                            </span>
                                          )}

                                          {isWorkspaceActive && (
                                            <div
                                              className="row-actions"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                className="row-act-btn"
                                                title="Duplicate ad"
                                                onClick={() =>
                                                  duplicateCampaign(
                                                    client.id,
                                                    project.id,
                                                    campaign.id
                                                  )
                                                }
                                              >
                                                <IconDuplicate />
                                              </button>
                                              <button
                                                className="row-act-btn is-danger"
                                                title="Delete ad"
                                                onClick={() =>
                                                  deleteCampaign(
                                                    client.id,
                                                    project.id,
                                                    campaign.id
                                                  )
                                                }
                                              >
                                                <IconTrash />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}

                                    {isWorkspaceActive && (
                                      <button
                                        className="tree-add-row tree-add-row-campaign"
                                        onClick={() => addCampaign(client.id, project.id)}
                                      >
                                        <IconPlus /> New Ad
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {isWorkspaceActive && (
                            <button
                              className="tree-add-row tree-add-row-project"
                              aria-label={`Add project to ${client.name}`}
                              onClick={() => addProject(client.id)}
                            >
                              <IconPlus /> Add Project
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      );
    };

    return (
      <>
        <div className="pane-header">
          <span className="pane-header-title">Workspaces</span>
        </div>

        <div className="pane-body">
          <div className="tree">
            <div className="tree-workspace-group-label">
              Shared
            </div>
            {cloudEnabled && authUser && (
              <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {incomingWorkspaceInvitesLoading ? (
                  <div className="tree-workspace-meta">Loading invites...</div>
                ) : incomingWorkspaceInvitesError ? (
                  <div className="tree-workspace-meta tree-workspace-meta-error">
                    {incomingWorkspaceInvitesError}
                  </div>
                ) : incomingWorkspaceInvites.length > 0 ? (
                  incomingWorkspaceInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="tree-workspace-meta"
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        background: "var(--surface)",
                      }}
                    >
                      <div style={{ color: "var(--ink)", fontWeight: 600, marginBottom: 2 }}>
                        Invite: {invite.workspaceName}
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        {invite.organizationName || "Organization"} · {invite.role}
                      </div>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          void acceptIncomingWorkspaceInvite(invite.id);
                        }}
                        type="button"
                      >
                        Accept
                      </button>
                    </div>
                  ))
                ) : null}
              </div>
            )}
            {sharedWorkspaces.length === 0 ? (
              <div className="tree-workspace-meta" style={{ marginBottom: 8 }}>
                {cloudEnabled
                  ? "No shared workspaces yet"
                  : "Enable Supabase to use shared workspaces"}
              </div>
            ) : (
              sharedWorkspaces.map((workspace) => renderWorkspaceNode(workspace))
            )}
            {cloudEnabled && authUser && canCreateSharedWorkspace && (
              <button
                className="tree-add-row"
                style={{ marginTop: 6 }}
                onClick={createWorkspace}
              >
                <IconPlus /> New Shared Workspace
              </button>
            )}
            {cloudEnabled && authUser && !canCreateSharedWorkspace && (
              <div className="tree-workspace-meta" style={{ marginTop: 6 }}>
                Owner account required to create a shared workspace.
              </div>
            )}

            <div className="tree-workspace-group-label" style={{ marginTop: 10 }}>
              Local
            </div>
            {renderWorkspaceNode(localWorkspaceGroup)}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="btn btn-primary btn-sm"
            onClick={addClient}
            title="Add client"
          >
            <IconPlus /> Add Client
          </button>
        </div>
      </>
    );
  }

  // ── Workspace View (middle pane) ───────────────────────────────

  function renderWorkspaceView() {
    const counts = countWorkspaceEntities(data);
    const isLocalWorkspace = activeWorkspace.kind === "local";
    const workspaceInvites = workspaceInvitesByWorkspace[activeWorkspaceId] ?? [];
    const workspaceMembers = workspaceMembersByWorkspace[activeWorkspaceId] ?? [];
    const inviteManageDenied =
      typeof workspaceInvitesError === "string" &&
      workspaceInvitesError.toLowerCase().includes("only workspace owners");
    const updatedLabel = workspaceStorageEstimate
      ? new Date(workspaceStorageEstimate.generatedAtIso).toLocaleTimeString()
      : "—";

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <div className="context-header">
          <div className="context-header-eyebrow">Workspace Settings</div>
          <div className="context-header-title">{activeWorkspace.name}</div>
          <div className="context-header-meta">
            {isLocalWorkspace
              ? "Manage local workspace diagnostics and browser storage."
              : "Manage workspace-level settings and diagnostics."}
          </div>
        </div>

        <div className="form-section" style={{ overflowY: "auto" }}>
          <div className="form-group">
            <label className="form-label">Workspace Name</label>
            <input
              className="form-input"
              value={workspaceNameFieldDraft}
              onChange={(e) => setWorkspaceNameFieldDraft(e.target.value)}
              onBlur={() => {
                void commitWorkspaceNameField();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitWorkspaceNameField();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setWorkspaceNameFieldDraft(activeWorkspace.name);
                }
              }}
              placeholder={DEFAULT_LOCAL_WORKSPACE_NAME}
            />
          </div>

          {!isLocalWorkspace && activeWorkspace.kind === "organization" && canDeleteActiveWorkspace && (
            <div className="form-group" style={{ marginTop: -6 }}>
              <button
                className="btn btn-danger btn-sm"
                type="button"
                onClick={deleteActiveWorkspace}
              >
                Delete Workspace
              </button>
            </div>
          )}

          {isLocalWorkspace ? (
            <>
              <div className="info-stat-block" style={{ gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                    Browser Storage (Estimate)
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => void refreshWorkspaceStorageEstimate()}
                    disabled={workspaceStorageLoading}
                  >
                    {workspaceStorageLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Usage is per browser profile for this site, not per individual project.
                  Updated: {updatedLabel}
                </div>

                {workspaceStorageError && (
                  <div style={{ fontSize: 12, color: "var(--danger)" }}>
                    {workspaceStorageError}
                  </div>
                )}

                {!workspaceStorageError && workspaceStorageEstimate && (
                  <>
                    <div className="info-stat-grid">
                      <div className="info-stat-block" style={{ padding: 12 }}>
                        <div className="info-stat-label">Used</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
                          {formatBytes(workspaceStorageEstimate.usage)}
                        </div>
                      </div>
                      <div className="info-stat-block" style={{ padding: 12 }}>
                        <div className="info-stat-label">Free</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
                          {formatBytes(workspaceStorageEstimate.free)}
                        </div>
                      </div>
                    </div>

                    <div className="info-stat-block" style={{ padding: 12, gap: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span className="info-stat-label">Total quota</span>
                        <strong style={{ color: "var(--ink)" }}>
                          {formatBytes(workspaceStorageEstimate.quota)}
                        </strong>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: 8,
                          borderRadius: 999,
                          background: "var(--bg)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${workspaceStorageEstimate.usagePct.toFixed(1)}%`,
                            height: "100%",
                            background: "var(--accent)",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        <span>{workspaceStorageEstimate.usagePct.toFixed(1)}% used</span>
                        <span>
                          Persistent storage:{" "}
                          {workspaceStorageEstimate.persisted == null
                            ? "unknown"
                            : workspaceStorageEstimate.persisted
                              ? "enabled"
                              : "not granted"}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {!workspaceStorageError &&
                  !workspaceStorageEstimate &&
                  !workspaceStorageLoading && (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      No estimate available yet.
                    </div>
                  )}
              </div>
            </>
          ) : (
            <>
              <div className="info-stat-block">
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                  Cloud Workspace
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Browser storage estimates are shown for the Local Workspace. Cloud
                  workspace storage and quotas are managed by Supabase.
                </div>
              </div>

              <div className="info-stat-block" style={{ gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                  Workspace Access
                </div>
                {activeWorkspace.kind !== "organization" ? (
                  <>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      This workspace is currently private. Enable collaboration to turn it
                      into a shared workspace with invites.
                    </div>
                    <div>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => void enableActiveWorkspaceCollaboration()}
                        disabled={workspaceInviteUpgradeLoading}
                      >
                        {workspaceInviteUpgradeLoading
                          ? "Enabling..."
                          : "Enable Collaboration"}
                      </button>
                    </div>
                    {workspaceInvitesError && (
                      <div style={{ fontSize: 12, color: "var(--danger)" }}>
                        {workspaceInvitesError}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Members in this workspace:
                    </div>
                    {workspaceMembersLoading ? (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Loading members...
                      </div>
                    ) : workspaceMembersError ? (
                      <div style={{ fontSize: 12, color: "var(--danger)" }}>
                        {workspaceMembersError}
                      </div>
                    ) : workspaceMembers.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        No members found.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {workspaceMembers.map((member) => (
                          <div
                            key={member.userId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              border: "1px solid var(--line)",
                              borderRadius: 10,
                              padding: "8px 10px",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  color: "var(--ink)",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {member.email ?? "Unknown user"}
                              </div>
                              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                                {member.role === "owner" ? "Owner" : "Member"}
                                {member.isCurrentUser ? " · You" : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Invite collaborators by email. Invites are scoped to this workspace.
                    </div>
                    {!inviteManageDenied && (
                      <div className="form-row" style={{ alignItems: "end" }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Invite Email</label>
                          <input
                            className="form-input"
                            type="email"
                            placeholder="name@company.com"
                            value={workspaceInviteEmailDraft}
                            onChange={(e) => setWorkspaceInviteEmailDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void addWorkspaceInvite();
                              }
                            }}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, maxWidth: 180 }}>
                          <label className="form-label">Role</label>
                          <div className="form-select-wrap">
                            <select
                              className="form-select"
                              value={workspaceInviteRoleDraft}
                              onChange={(e) =>
                                setWorkspaceInviteRoleDraft(
                                  e.target.value === "owner" ? "owner" : "member"
                                )
                              }
                            >
                              <option value="member">Member</option>
                              <option value="owner">Owner</option>
                            </select>
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => void addWorkspaceInvite()}
                          disabled={!workspaceInviteEmailDraft.trim() || workspaceInvitesSaving}
                          style={{ marginBottom: 6 }}
                        >
                          {workspaceInvitesSaving ? "Saving..." : "Add Invite"}
                        </button>
                      </div>
                    )}
                    {workspaceInvitesError && (
                      <div style={{ fontSize: 12, color: "var(--danger)" }}>
                        {workspaceInvitesError}
                      </div>
                    )}
                    {workspaceInvitesLoading ? (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Loading invites...
                      </div>
                    ) : workspaceInvites.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        No pending invites.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {workspaceInvites.map((invite) => (
                          <div
                            key={invite.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              border: "1px solid var(--line)",
                              borderRadius: 10,
                              padding: "8px 10px",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  color: "var(--ink)",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {invite.email}
                              </div>
                              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                                {invite.role === "owner" ? "Owner" : "Member"} · Expires{" "}
                                {new Date(invite.expiresAt).toLocaleDateString()}
                              </div>
                            </div>
                            {!inviteManageDenied && (
                              <button
                                className="btn btn-ghost btn-xs"
                                type="button"
                                onClick={() => void removeWorkspaceInvite(invite.id)}
                                title="Revoke invite"
                                disabled={workspaceInvitesSaving}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          <div className="info-stat-grid">
            <div className="info-stat-block">
              <div className="info-stat-value">{counts.clients}</div>
              <div className="info-stat-label">Clients</div>
            </div>
            <div className="info-stat-block">
              <div className="info-stat-value">{counts.projects}</div>
              <div className="info-stat-label">Projects</div>
            </div>
            <div className="info-stat-block">
              <div className="info-stat-value">{counts.campaigns}</div>
              <div className="info-stat-label">Ads</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderUserSettingsView(opts?: { modal?: boolean }) {
    const inModal = opts?.modal === true;
    if (!cloudEnabled || !authUser) {
      return (
        <div className="empty-state">
          <h3>Account settings unavailable</h3>
          <p>Sign in to edit user settings.</p>
        </div>
      );
    }

    const fallbackName = defaultProfileDisplayName(authUser.email ?? null);
    const title = effectiveProfileDisplayName || fallbackName;
    const settingsDirty =
      profileDisplayNameDraft.trim() !== profileDisplayNameSaved.trim() ||
      profileStatusDraft !== profileStatusSaved ||
      (profileImageDataUrl ?? null) !== (profileImageDataUrlSaved ?? null);

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="context-header">
          <div className="context-header-eyebrow">User Settings</div>
          <div className="context-header-title">{title}</div>
          <div className="context-header-meta">
            Update your display name and profile image.
          </div>
          {inModal && <div style={{ minHeight: 4 }} />}
        </div>

        <div className="form-section" style={{ overflowY: "auto" }}>
          {profileSettingsLoading && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Loading profile settings...
            </div>
          )}
          <div className="client-profile-row">
            <div className="client-avatar-lg">
              {profileImageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImageDataUrl} alt="" />
              ) : (
                <IconUser />
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pickUserProfileImage(file);
                    e.currentTarget.value = "";
                  }}
                />
                Upload Photo
              </label>
              {profileImageDataUrl && (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => setProfileImageDataUrl(null)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              className="form-input"
              value={profileDisplayNameDraft}
              onChange={(e) => setProfileDisplayNameDraft(e.target.value)}
              placeholder={fallbackName}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <input
              className="form-input"
              value={profileStatusDraft}
              onChange={(e) => setProfileStatusDraft(e.target.value)}
              placeholder="What's your status?"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Login Email</label>
            <input
              className="form-input"
              value={authUser.email ?? ""}
              readOnly
            />
          </div>

          <div className="info-stat-block" style={{ gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
              Upcoming
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              More profile preferences can live here over time.
            </div>
          </div>

          {profileSettingsError && (
            <div style={{ fontSize: 12, color: "var(--danger)" }}>
              {profileSettingsError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => {
                void saveUserProfileSettings();
              }}
              disabled={!settingsDirty || profileSettingsSaving || profileSettingsLoading}
            >
              {profileSettingsSaving ? "Saving..." : "Save Settings"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => {
                setProfileDisplayNameDraft(profileDisplayNameSaved);
                setProfileStatusDraft(profileStatusSaved);
                setProfileImageDataUrl(profileImageDataUrlSaved);
              }}
              disabled={!settingsDirty || profileSettingsSaving}
            >
              Reset
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setShowUserSettings(false)}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderUserSettingsModal() {
    if (!showUserSettings) return null;
    return (
      <>
        <div
          className="user-settings-backdrop"
          onClick={() => setShowUserSettings(false)}
          aria-hidden="true"
        />
        <div
          className="user-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="User settings"
        >
          <button
            type="button"
            className="user-settings-close-x"
            onClick={() => setShowUserSettings(false)}
            aria-label="Close user settings"
            title="Close"
          >
            ×
          </button>
          {renderUserSettingsView({ modal: true })}
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
            <label
              style={{
                marginTop: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: "var(--text-2)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={client.isVerified}
                onChange={(e) =>
                  updateClient(client.id, { isVerified: e.target.checked })
                }
              />
              Verified account
            </label>
            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => requestDeleteClient(client)}
              >
                Delete Client
              </button>
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
          <div style={{ marginTop: 10 }}>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => requestDeleteProject(client.id, project)}
            >
              Delete Project
            </button>
          </div>
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
    const isInstagramFeed = campaign.platform === "Instagram Feed";
    const isInstagramReels = campaign.platform === "Instagram Reels";
    const isInstagramStory = campaign.platform === "Instagram Story";
    const isFacebookFeed = campaign.platform === "Facebook Feed";
    const campaignCtaOptions = isFacebookFeed ? FACEBOOK_CTA_OPTIONS : CTA_OPTIONS;
    const ctaColorDraft = ctaColorDrafts[campaign.id] ?? campaign.ctaBgColor;
    const engagementKey = engagementSettingKey(campaign.id);
    const engagement = engagementSettingForCampaign(campaign.id);
    const engagementRollKey = engagementRollNonce[campaign.id] ?? 0;
    const showPresenceCard =
      cloudEnabled && !activeWorkspaceIsLocal && activeCampaignHasPresenceLock;
    const activeIncomingHandoffRequest = incomingHandoffRequests[0] ?? null;
    const hasIncomingHandoffRequest = Boolean(activeIncomingHandoffRequest);
    const showPresenceOverlayStack =
      showPresenceCard ||
      hasIncomingHandoffRequest ||
      Boolean(incomingHandoffRequestsError) ||
      Boolean(requestHandoffNotice);
    const editorsSummary =
      activeCampaignPresenceLabels.length > 0
        ? activeCampaignPresenceLabels.join(", ")
        : `${activeCampaignPresenceOthers.length} collaborator${
            activeCampaignPresenceOthers.length === 1 ? "" : "s"
          }`;
    const incomingRequesterLabel = activeIncomingHandoffRequest
      ? presenceLabelFromIdentity({
          displayName: activeIncomingHandoffRequest.fromDisplayName,
          email: activeIncomingHandoffRequest.fromEmail,
        })
      : "Another collaborator";

    function commitCtaColorDraft() {
      const normalized = normalizeHexInput(ctaColorDraft);
      if (!normalized) {
        setCtaColorDrafts((prev) => ({
          ...prev,
          [campaign.id]: campaign.ctaBgColor,
        }));
        return;
      }
      setCtaColorDrafts((prev) => ({ ...prev, [campaign.id]: normalized }));
      updateCampaign({
        ctaBgColor: normalized,
        ctaTextColor: contrastText(normalized),
      });
    }

    const adBrief = buildAdBrief({
      audienceProfile: campaign.audienceProfile,
      objective: project.objective,
      primaryGoal: project.primaryGoal,
      cta: campaign.cta,
    });
    const bodyCopyCharacterCount = campaign.primaryText.length;
    const isEditingCampaignTitle = editingCampaignTitleId === campaign.id;

    function beginCampaignTitleEdit() {
      if (activeCampaignEditingLocked) return;
      setEditingCampaignTitleId(campaign.id);
      setEditingCampaignTitleDraft(campaign.name);
    }

    function cancelCampaignTitleEdit() {
      setEditingCampaignTitleId(null);
      setEditingCampaignTitleDraft(campaign.name);
    }

    function commitCampaignTitleEdit() {
      const trimmed = editingCampaignTitleDraft.trim();
      if (trimmed && trimmed !== campaign.name) {
        updateCampaign({ name: trimmed });
      } else {
        setEditingCampaignTitleDraft(campaign.name);
      }
      setEditingCampaignTitleId(null);
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="pane-body">
          <div className="campaign-pane-utility">
            <div className="campaign-utility-row">
              <div className="campaign-utility-title-wrap">
                {isEditingCampaignTitle ? (
                  <input
                    className="campaign-utility-title-input"
                    value={editingCampaignTitleDraft}
                    onChange={(e) => setEditingCampaignTitleDraft(e.target.value)}
                    onBlur={commitCampaignTitleEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCampaignTitleEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelCampaignTitleEdit();
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="campaign-utility-title-button"
                    onDoubleClick={beginCampaignTitleEdit}
                    disabled={activeCampaignEditingLocked}
                    title={activeCampaignEditingLocked ? "Locked by active collaborator" : "Double-click to rename"}
                  >
                    {campaign.name || "Untitled Ad"}
                  </button>
                )}
              </div>
              <div className="campaign-utility-actions">
                {copyLinkFlash && <span className="copy-success">Link copied!</span>}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={copyCurrentCampaignLink}
                  disabled={!canCopyCampaignLink}
                  title={
                    canCopyCampaignLink
                      ? "Copy shareable ad link"
                      : "Ad links are available for shared/cloud workspaces."
                  }
                >
                  Copy Link
                </button>
                <button
                  className={`btn btn-sm ${campaignStatusButtonClass(campaign.status)}`}
                  disabled={activeCampaignEditingLocked}
                  onClick={() =>
                    updateCampaign({
                      status: nextCampaignStatus(campaign.status),
                    })
                  }
                >
                  <div className={`status-dot status-dot-${campaign.status}`} />
                  {campaignStatusLabel(campaign.status)}
                </button>
              </div>
            </div>
          </div>
          {/* Ad Editor (only mode now — campaign settings live on project view) */}
            <div className="form-section">
              {showPresenceOverlayStack && (
                <div className="campaign-presence-overlay-stack">
                  {showPresenceCard && (
                    <div
                      className="info-stat-block campaign-presence-overlay-card"
                      style={{
                        padding: 12,
                        gap: 8,
                        border: "1px solid var(--danger-soft)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 999,
                              border: "1px solid var(--danger-soft)",
                              color: "var(--danger)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <IconUser />
                          </span>
                          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                            {`${editorsSummary} ${
                              activeCampaignPresenceOthers.length === 1 ? "is" : "are"
                            } editing this ad right now.`}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          disabled={requestHandoffPending}
                          onClick={() => void requestActiveCampaignHandoff()}
                        >
                          {requestHandoffPending ? "Requesting..." : "Request Handoff"}
                        </button>
                      </div>
                      {activeCampaignPresenceError && (
                        <div style={{ fontSize: 12, color: "var(--danger)" }}>
                          {activeCampaignPresenceError}
                        </div>
                      )}
                    </div>
                  )}
                  {hasIncomingHandoffRequest && activeIncomingHandoffRequest && (
                    <div
                      className="info-stat-block campaign-presence-overlay-card"
                      style={{
                        padding: 12,
                        gap: 8,
                        border: "1px solid var(--line)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                          {incomingRequesterLabel} requested editing handoff.
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            disabled={respondHandoffPendingId === activeIncomingHandoffRequest.id}
                            onClick={() =>
                              void respondToIncomingHandoffRequest(
                                activeIncomingHandoffRequest,
                                "declined"
                              )
                            }
                          >
                            Not now
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            disabled={respondHandoffPendingId === activeIncomingHandoffRequest.id}
                            onClick={() =>
                              void respondToIncomingHandoffRequest(
                                activeIncomingHandoffRequest,
                                "accepted"
                              )
                            }
                          >
                            {respondHandoffPendingId === activeIncomingHandoffRequest.id
                              ? "Sending..."
                              : "Hand Off"}
                          </button>
                        </div>
                      </div>
                      {incomingHandoffRequests.length > 1 && (
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          {incomingHandoffRequests.length - 1} additional pending request
                          {incomingHandoffRequests.length - 1 === 1 ? "" : "s"}.
                        </div>
                      )}
                    </div>
                  )}
                  {incomingHandoffRequestsError && (
                    <div className="campaign-presence-overlay-note campaign-presence-overlay-note-danger">
                      {incomingHandoffRequestsError}
                    </div>
                  )}
                  {requestHandoffNotice && (
                    <div className="campaign-presence-overlay-note">
                      {requestHandoffNotice}
                    </div>
                  )}
                </div>
              )}
              <div className="ad-brief-card">
                <p className="ad-brief-text">{adBrief}</p>
              </div>
              <fieldset
                className="campaign-editor-fields"
                disabled={activeCampaignEditingLocked}
                style={{ border: "none", margin: 0, padding: 0, minInlineSize: 0 }}
              >
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
                    <label className="form-label">Format</label>
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

                <div className="form-group body-copy-group">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label className="form-label" style={{ margin: 0 }}>Body Copy</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {copyFlash && <span className="copy-success">Copied!</span>}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          copyTextWithFeedback(campaign.primaryText, () => {
                            setCopyFlash(true);
                            setTimeout(() => setCopyFlash(false), 1200);
                          });
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className="body-copy-field-shell">
                    <textarea
                      className="form-textarea form-textarea-body-copy"
                      rows={6}
                      value={campaign.primaryText}
                      onChange={(e) => updateCampaign({ primaryText: e.target.value })}
                      placeholder="Start writing…"
                    />
                    <div className="body-copy-meta">
                      {bodyCopyCharacterCount} characters
                    </div>
                  </div>
                </div>

                {isFacebookFeed && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Page Name</label>
                      <input
                        className="form-input"
                        value={campaign.facebookPageName}
                        onChange={(e) => updateCampaign({ facebookPageName: e.target.value })}
                        placeholder=" "
                      />
                    </div>
                  </div>
                )}

                {isFacebookFeed && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Headline</label>
                      <input
                        className="form-input"
                        value={campaign.headline}
                        onChange={(e) => updateCampaign({ headline: e.target.value })}
                        placeholder=" "
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">URL</label>
                      <input
                        className="form-input"
                        value={campaign.url}
                        onChange={(e) => updateCampaign({ url: e.target.value })}
                        placeholder="e.g. example.com/product"
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    {isInstagramStory ? "Call to Action Text" : "Call to Action"}
                  </label>
                  {isInstagramStory ? (
                    <input
                      className="form-input"
                      value={campaign.cta}
                      onChange={(e) => updateCampaign({ cta: e.target.value })}
                      placeholder="e.g. Learn More"
                    />
                  ) : (
                    <div className="form-select-wrap">
                      <select
                        className="form-select"
                        value={campaign.cta}
                        onChange={(e) =>
                          updateCampaign({ cta: e.target.value })
                        }
                      >
                        {campaignCtaOptions.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <details className="campaign-advanced">
                  <summary className="campaign-advanced-summary">
                    Advanced formatting
                  </summary>
                  <div className="campaign-advanced-body">
                    {(isInstagramFeed || isFacebookFeed || isInstagramReels) && (
                      <div className="form-group">
                        <label className="form-label">Engagement</label>
                        <div className="engagement-dice-row">
                          <button
                            type="button"
                            className="engagement-dice-btn"
                            onClick={() => {
                              const nextPreset = nextEngagementPreset(engagement.preset);
                              setEngagementSettings((prev) => ({
                                ...prev,
                                [engagementKey]: {
                                  preset: nextPreset,
                                  seed: randomEngagementSeed(),
                                },
                              }));
                              setEngagementRollNonce((prev) => ({
                                ...prev,
                                [campaign.id]: (prev[campaign.id] ?? 0) + 1,
                              }));
                            }}
                            title="Cycle engagement level and randomize metrics"
                            aria-label={`Engagement ${engagementPresetLabel(
                              engagement.preset
                            )}. Click to cycle and randomize.`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              key={`${campaign.id}-${engagementRollKey}`}
                              src={ENGAGEMENT_DICE_ICON[engagement.preset]}
                              alt=""
                              aria-hidden="true"
                              className={`engagement-dice-icon${
                                engagementRollKey > 0 ? " engagement-dice-icon-roll" : ""
                              }`}
                            />
                          </button>
                          <span className="engagement-dice-label">
                            {engagementPresetLabel(engagement.preset)}
                          </span>
                        </div>
                      </div>
                    )}

                    {audienceOptions.length > 0 && (
                      <div className="form-group">
                        <label className="form-label">Audience</label>
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
                      <label className="form-label">CTA Color</label>
                      <div className="color-row">
                        <label className="color-swatch" title="Pick color">
                          <input
                            type="color"
                            value={campaign.ctaBgColor}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCtaColorDrafts((prev) => ({
                                ...prev,
                                [campaign.id]: v,
                              }));
                              updateCampaign({
                                ctaBgColor: v,
                                ctaTextColor: contrastText(v),
                              });
                            }}
                          />
                        </label>
                        <input
                          className="form-input"
                          value={ctaColorDraft}
                          onChange={(e) =>
                            setCtaColorDrafts((prev) => ({
                              ...prev,
                              [campaign.id]: e.target.value,
                            }))
                          }
                          onBlur={commitCtaColorDraft}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitCtaColorDraft();
                            } else if (e.key === "Escape") {
                              setCtaColorDrafts((prev) => ({
                                ...prev,
                                [campaign.id]: campaign.ctaBgColor,
                              }));
                            }
                          }}
                          placeholder="#f2f2f2"
                          style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
                        />
                      </div>
                    </div>

                    {isInstagramStory && (
                      <div className="form-group">
                        <label
                          className="form-label"
                          style={{ display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <input
                            type="checkbox"
                            checked={campaign.ctaVisible}
                            onChange={(e) =>
                              updateCampaign({ ctaVisible: e.target.checked })
                            }
                          />
                          Show CTA
                        </label>
                      </div>
                    )}
                  </div>
                </details>
              </fieldset>
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
    const engagement = engagementSettingForCampaign(campaign.id);
    const isOverlayCampaign = false;
    const storyOffsetKey = storyCtaOffsetKey(campaign.id);
    const storyOffset = storyCtaOffsets[storyOffsetKey] ?? { x: 0, y: 0 };
    const previewBackdropColor = normalizeHex(
      mockupBackdropColor,
      DEFAULT_MOCKUP_BACKDROP
    );
    const debugUpdatedLabel = localDebugStats
      ? new Date(localDebugStats.generatedAtIso).toLocaleTimeString()
      : "—";
    const previewEditingLocked = activeCampaignEditingLocked;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
          backgroundColor: previewBackdropColor,
        }}
      >
        {/* Toolbar */}
        <div className="preview-toolbar">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={onPreviewFilePicked}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-secondary btn-sm"
            onClick={pickPreviewMedia}
            disabled={previewEditingLocked}
            title={
              previewEditingLocked
                ? activeCampaignHandoffReleased
                  ? "You handed off editing on this ad."
                  : "Another collaborator is actively editing this ad."
                : "Upload media"
            }
          >
            <IconUpload /> Upload media
          </button>
          {previewEditingLocked && (
            <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
              {activeCampaignHandoffReleased
                ? "Editing handed off"
                : "Locked by active collaborator"}
            </span>
          )}
          {selectedMedia.kind !== "none" && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={previewEditingLocked}
              onClick={() => {
                if (previewEditingLocked) return;
                setCampaignMedia(campaign.id, EMPTY_MEDIA);
                updateCampaign({
                  mediaStoragePath: "",
                  mediaKind: "none",
                  mediaMimeType: "",
                });
                if (cloudEnabled && !activeWorkspaceIsLocal) {
                  void clearCampaignMediaInCloud(campaign.id).catch((error) => {
                    console.error("Failed to clear media", error);
                  });
                }
              }}
            >
              Remove media
            </button>
          )}
          {isOverlayCampaign && (
            <button
              className={`btn btn-sm ${showIgFeedOverlay ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setShowIgFeedOverlay((enabled) => !enabled)}
              title={
                campaign.platform === "Instagram Reels"
                  ? "Overlay public/images/testing/overlay-reels.png"
                  : campaign.platform === "Facebook Feed"
                    ? "Overlay public/images/testing/overlay-facebook.png"
                  : "Overlay public/images/testing/overlay1.png"
              }
            >
              Overlay {showIgFeedOverlay ? "On" : "Off"}
            </button>
          )}
          {isOverlayCampaign && showIgFeedOverlay && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                color: "var(--ink-2)",
              }}
            >
              <label title="Overlay opacity" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Opacity
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(igFeedOverlayOpacity * 100)}
                  onChange={(e) =>
                    setIgFeedOverlayOpacity(
                      Math.max(0, Math.min(1, Number(e.target.value) / 100))
                    )
                  }
                  style={{ width: 88 }}
                />
                <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(igFeedOverlayOpacity * 100)}%
                </span>
              </label>
              <label title="Overlay scale" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Scale
                <input
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.01}
                  value={igFeedOverlayScale}
                  onChange={(e) =>
                    setIgFeedOverlayScale(
                      Math.max(0.4, Math.min(2.5, Number(e.target.value)))
                    )
                  }
                  style={{ width: 88 }}
                />
                <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {igFeedOverlayScale.toFixed(2)}x
                </span>
              </label>
              <label title="Overlay X offset" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                X
                <input
                  type="range"
                  min={-220}
                  max={220}
                  step={1}
                  value={igFeedOverlayOffsetX}
                  onChange={(e) =>
                    setIgFeedOverlayOffsetX(
                      Math.max(-220, Math.min(220, Number(e.target.value)))
                    )
                  }
                  style={{ width: 88 }}
                />
                <span style={{ minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {igFeedOverlayOffsetX}
                </span>
              </label>
              <label title="Overlay Y offset" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Y
                <input
                  type="range"
                  min={-360}
                  max={360}
                  step={1}
                  value={igFeedOverlayOffsetY}
                  onChange={(e) =>
                    setIgFeedOverlayOffsetY(
                      Math.max(-360, Math.min(360, Number(e.target.value)))
                    )
                  }
                  style={{ width: 88 }}
                />
                <span style={{ minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {igFeedOverlayOffsetY}
                </span>
              </label>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setIgFeedOverlayOpacity(0.4);
                  setIgFeedOverlayScale(1);
                  setIgFeedOverlayOffsetX(0);
                  setIgFeedOverlayOffsetY(0);
                }}
              >
                Reset Overlay
              </button>
            </div>
          )}
          <label
            title="Mockup backdrop color"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--ink-2)",
            }}
          >
            Backdrop
            <input
              type="color"
              value={mockupBackdropColor}
              onChange={(e) =>
                setMockupBackdropColor(
                  normalizeHex(e.target.value, DEFAULT_MOCKUP_BACKDROP)
                )
              }
              style={{
                width: 28,
                height: 22,
                border: "1px solid var(--line-strong)",
                borderRadius: 6,
                padding: 0,
                background: "transparent",
                cursor: "pointer",
              }}
            />
          </label>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--ink-2)",
              userSelect: "none",
            }}
            title="PNG exports will use a transparent backdrop outside the phone frame"
          >
            <input
              type="checkbox"
              checked={transparentPngExport}
              onChange={(e) => setTransparentPngExport(e.target.checked)}
            />
            Transparent PNG
          </label>
          <button
            className={`btn btn-sm ${debugPanelOpen ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setDebugPanelOpen((open) => !open);
              if (!debugPanelOpen) {
                void refreshLocalDebugStats();
              }
            }}
          >
            {debugPanelOpen ? "Hide Debug" : "Debug"}
          </button>
          <div className="zoom-controls">
            <button
              className="zoom-btn"
              onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(1)))}
            >
              −
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              className="zoom-btn"
              onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)))}
            >
              +
            </button>
          </div>
        </div>

        {/* Preview body — ref used for auto-zoom */}
        <div
          className="preview-body"
          ref={previewBodyRef}
          onDrop={onPreviewDrop}
          onDragOver={onPreviewDragOver}
          style={{ backgroundColor: previewBackdropColor }}
        >
          {debugPanelOpen && (
            <div className="local-debug-panel">
              <div className="local-debug-panel-header">
                <strong>Local Persistence</strong>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void refreshLocalDebugStats()}
                  disabled={debugPanelLoading}
                >
                  {debugPanelLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {debugPanelError && (
                <div className="local-debug-panel-error">{debugPanelError}</div>
              )}
              {localDebugStats && (
                <>
                  <div className="local-debug-panel-meta">
                    Updated {debugUpdatedLabel} · Local workspace `{localDebugStats.debugWorkspaceId}`
                  </div>
                  <div className="local-debug-grid">
                    <div className="local-debug-row">
                      <span>Active Workspace</span>
                      <strong>{activeWorkspace.name} ({activeWorkspace.kind})</strong>
                    </div>
                    <div className="local-debug-row">
                      <span>IndexedDB Snapshot</span>
                      <strong>{localDebugStats.workspaceSnapshot.exists ? "Present" : "Missing"}</strong>
                    </div>
                    <div className="local-debug-row">
                      <span>Clients / Projects / Ads</span>
                      <strong>
                        {localDebugStats.workspaceSnapshot.clients} / {localDebugStats.workspaceSnapshot.projects} / {localDebugStats.workspaceSnapshot.campaigns}
                      </strong>
                    </div>
                    <div className="local-debug-row">
                      <span>Snapshot Size</span>
                      <strong>{formatBytes(localDebugStats.workspaceSnapshot.bytes)}</strong>
                    </div>
                    <div className="local-debug-row">
                      <span>Stored Media</span>
                      <strong>
                        {localDebugStats.media.count} ({localDebugStats.media.images} img / {localDebugStats.media.videos} vid)
                      </strong>
                    </div>
                    <div className="local-debug-row">
                      <span>Media Size</span>
                      <strong>{formatBytes(localDebugStats.media.bytes)}</strong>
                    </div>
                    <div className="local-debug-row">
                      <span>UI localStorage</span>
                      <strong>{formatBytes(localDebugStats.localStorage.uiBytes)}</strong>
                    </div>
                    <div className="local-debug-row">
                      <span>Legacy Workspace Keys</span>
                      <strong>
                        {localDebugStats.localStorage.legacyWorkspaceKeys} · {formatBytes(localDebugStats.localStorage.legacyWorkspaceBytes)}
                      </strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {/* Feed view — routed by platform */}
            <div
              className="preview-scaled"
              style={{ transform: `scale(${zoom * ZOOM_BASE})` }}
            >
              <div ref={previewExportRef} className="preview-export-surface">
                <PreviewCanvas
                  ref={canvasRef}
                  primaryText={campaign.primaryText}
                  facebookPageName={campaign.facebookPageName}
                  headline={campaign.headline}
                  url={campaign.url}
                  cta={campaign.cta}
                  ctaVisible={campaign.ctaVisible}
                  ctaBgColor={campaign.ctaBgColor}
                  ctaTextColor={campaign.ctaTextColor}
                  platform={campaign.platform}
                  mediaAspect={campaign.mediaAspect}
                  clientName={client.name}
                  clientVerified={client.isVerified}
                  clientAvatarUrl={client.profileImageDataUrl}
                  media={selectedMedia}
                  instagramFeedOverlayEnabled={isOverlayCampaign && showIgFeedOverlay}
                  instagramFeedOverlayOpacity={igFeedOverlayOpacity}
                  instagramFeedOverlayScale={igFeedOverlayScale}
                  instagramFeedOverlayOffsetX={igFeedOverlayOffsetX}
                  instagramFeedOverlayOffsetY={igFeedOverlayOffsetY}
                  mockupBackdropColor={mockupBackdropColor}
                  transparentPngExport={transparentPngExport}
                  storyCtaOffsetX={storyOffset.x}
                  storyCtaOffsetY={storyOffset.y}
                  engagementPreset={engagement.preset}
                  engagementSeed={engagement.seed}
                  onStoryCtaOffsetChange={(offsetX, offsetY) => {
                    setStoryCtaOffsets((prev) => {
                      const existing = prev[storyOffsetKey];
                      if (existing && existing.x === offsetX && existing.y === offsetY) {
                        return prev;
                      }
                      return {
                        ...prev,
                        [storyOffsetKey]: { x: offsetX, y: offsetY },
                      };
                    });
                  }}
                  onMediaFileSelected={(file) => {
                    void setMediaFromFile(campaign.id, file);
                  }}
                  onMediaChange={(m) => setCampaignMedia(campaign.id, m)}
                />
              </div>
            </div>
        </div>
      </div>
    );
  }

  // ── Info Pane (right, when client/project selected) ─────────────

  function renderInfoPane() {
    if (selectionLevel === "workspace") {
      return (
        <div className="info-pane">
          <div className="info-stat-block">
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
              Workspace selected
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Workspace settings are shown in the middle pane.
            </div>
          </div>
        </div>
      );
    }

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
      const ready = selectedProject.campaigns.filter((c) => c.status !== "draft").length;
      return (
        <div className="info-pane">
          <div className="info-stat-grid">
            <div className="info-stat-block">
              <div className="info-stat-value">{selectedProject.campaigns.length}</div>
              <div className="info-stat-label">Creatives</div>
            </div>
            <div className="info-stat-block">
              <div className="info-stat-value">{ready}</div>
              <div className="info-stat-label">Ready+</div>
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

              {isVideo && (
                <button
                  className="export-option"
                  disabled={isVideoRecordingExport}
                  onClick={async () => {
                    close();
                    const blob = await exportCompositedVideoWebm(selectedMedia);
                    if (blob) {
                      triggerDownload(blob, `${slugify(selectedCampaign.name)}_composited.webm`);
                    }
                  }}
                >
                  <div className="export-option-icon">🎞️</div>
                  <div className="export-option-text">
                    <div className="export-option-label">Export composited video (.webm)</div>
                    <div className="export-option-desc">Rendered phone mockup video for this platform</div>
                  </div>
                </button>
              )}

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

  if (cloudEnabled && !supabase) {
    return (
      <div className="app-root" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="empty-state">
          <h3>Authentication unavailable</h3>
          <p>Supabase client is not available.</p>
        </div>
      </div>
    );
  }

  if (cloudEnabled && !authReady) {
    return (
      <div className="app-root" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="empty-state">
          <h3>Loading account…</h3>
        </div>
      </div>
    );
  }

  if (cloudEnabled && !authUser && supabase) {
    return (
      <div className="app-root" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="empty-state">
          <h3>Redirecting to sign in…</h3>
        </div>
      </div>
    );
  }

  const activeWorkspaceSyncConflict = workspaceSyncConflicts[activeWorkspaceId];

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
            disabled={!selectedClient || selectionLevel === "workspace" || showUserSettings}
          >
            Export ↑
          </button>
          {cloudEnabled && authUser && (
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowUserSettings(true)}
                title="Open user settings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  maxWidth: 220,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    overflow: "hidden",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--line)",
                    color: "var(--ink-2)",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {profileImageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profileImageDataUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    effectiveProfileDisplayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {effectiveProfileDisplayName}
                </span>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
                Sign Out
              </button>
            </>
          )}
        </div>
      </header>

      {cloudEnabled && showImportPrompt && authUser && (
        <div
          style={{
            margin: "10px 16px 0",
            border: "1px solid var(--line)",
            background: "var(--pane)",
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-1)" }}>
              Import local workspace data?
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Found legacy browser data. Import once into your personal cloud workspace.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={skipLegacyWorkspaceImport} disabled={importPending}>
              Skip
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => void importLegacyWorkspaceNow()} disabled={importPending}>
              {importPending ? "Importing..." : "Import now"}
            </button>
          </div>
        </div>
      )}

      {cloudEnabled && !activeWorkspaceIsLocal && activeWorkspaceSyncConflict && (
        <div className="workspace-conflict-overlay" role="alert">
          <div className="workspace-conflict-card">
            <div className="workspace-conflict-copy">
              <div className="workspace-conflict-title">
                Changes were made in another session. What would you like to do?
              </div>
              
              <div className="workspace-conflict-detail">{activeWorkspaceSyncConflict}</div>
            </div>
            <div className="workspace-conflict-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void reloadActiveWorkspaceFromCloud();
                }}
              >
                Discard my changes
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  void overwriteActiveWorkspaceWithLocal();
                }}
              >
                Save my changes
              </button>
            </div>
          </div>
        </div>
      )}

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
            : selectionLevel === "workspace"
              ? renderWorkspaceView()
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
      {renderUserSettingsModal()}

      {/* Undo toast */}
      {pendingUndo && (
        <div className="toast">
          Deleted {pendingUndo.label}
          <button className="toast-undo" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

      {isVideoRecordingExport && (
        <div className="recording-badge" aria-live="polite" role="status">
          <span className="recording-dot" />
          Recording...
        </div>
      )}
    </div>
  );
}
