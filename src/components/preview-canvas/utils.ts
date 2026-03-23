import type { StoryExportScene, StoryLikeSurface } from "@/export/story/types";
import type { MediaAspect, PreviewMedia, Rect } from "./types";

export function toStoryExportMedia(media: PreviewMedia): StoryExportScene["media"] {
  if (media.kind === "image") return { kind: "image", url: media.url };
  if (media.kind === "video") return { kind: "video", url: media.url };
  return { kind: "none" };
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, r: number) {
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.fill();
}

export function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  r: number,
  lineWidth: number
) {
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function fitText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}...`;
}

export function aspectToRatio(aspect: MediaAspect): number {
  if (aspect === "3:4") return 3 / 4;
  if (aspect === "9:16") return 9 / 16;
  return 1;
}

export function storySurfaceFromPlatform(platform: string): StoryLikeSurface | null {
  const key = platform.toLowerCase();
  if (key.includes("tiktok")) return "tiktok";
  if (key.includes("reels")) return "instagram-reels";
  if (key.includes("story")) return "instagram-story";
  return null;
}

export function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

export function alphaHex(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex, "#000000");
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const channel = Math.round(safeAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${normalized}${channel}`;
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dest: Rect
) {
  const scale = Math.max(dest.w / srcW, dest.h / srcH);
  const sw = dest.w / scale;
  const sh = dest.h / scale;
  const sx = (srcW - sw) / 2;
  const sy = (srcH - sh) / 2;
  ctx.drawImage(source, sx, sy, sw, sh, dest.x, dest.y, dest.w, dest.h);
}

export function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  color: string
) {
  const width = Math.max(1, Math.round(rect.w));
  const height = Math.max(1, Math.round(rect.h));
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offscreenCtx = offscreen.getContext("2d");
  if (!offscreenCtx) return;

  offscreenCtx.drawImage(image, 0, 0, width, height);
  offscreenCtx.globalCompositeOperation = "source-in";
  offscreenCtx.fillStyle = color;
  offscreenCtx.fillRect(0, 0, width, height);
  ctx.drawImage(offscreen, rect.x, rect.y, rect.w, rect.h);
}

