import { FONT_STACK } from "@/components/preview-canvas/constants";
import type { Layout, Rect } from "@/components/preview-canvas/types";
import {
  drawCover,
  fitText,
  roundedRectPath,
} from "@/rendering/core/primitives";
import { drawUnifiedStatusBar } from "@/rendering/core/statusBar";
import type { DrawFeedSurfaceArgs } from "./types";

export { drawWrappedText } from "@/rendering/core/primitives";

export function drawFeedStatusBar(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  tone: "auto" | "light" | "dark" = "auto"
) {
  drawUnifiedStatusBar(ctx, layout, {
    tone,
    fallbackTone: "dark",
    timeLabel: "11:13",
  });
}

export async function drawFeedMedia(
  args: Pick<DrawFeedSurfaceArgs, "ctx" | "media" | "video" | "loadImageFromUrl">,
  mediaRect: Rect,
  placeholderLabel = "Drop media to preview"
) {
  const { ctx, media, video, loadImageFromUrl } = args;

  ctx.fillStyle = "#10131b";
  ctx.fillRect(mediaRect.x, mediaRect.y, mediaRect.w, mediaRect.h);

  if (media.kind === "video" && video && video.videoWidth && video.videoHeight) {
    drawCover(ctx, video, video.videoWidth, video.videoHeight, mediaRect);
    return;
  }

  if (media.kind === "image") {
    const image = await loadImageFromUrl(media.url);
    if (image) {
      drawCover(ctx, image, image.naturalWidth, image.naturalHeight, mediaRect);
      return;
    }
  }

  const gradient = ctx.createLinearGradient(mediaRect.x, mediaRect.y, mediaRect.x, mediaRect.y + mediaRect.h);
  gradient.addColorStop(0, "#1c2231");
  gradient.addColorStop(1, "#2f3a52");
  ctx.fillStyle = gradient;
  ctx.fillRect(mediaRect.x, mediaRect.y, mediaRect.w, mediaRect.h);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `500 ${8.5 * (mediaRect.w / 364)}px ${FONT_STACK}`;
  ctx.fillText(placeholderLabel, mediaRect.x + 12 * (mediaRect.w / 364), mediaRect.y + mediaRect.h / 2);
}

export async function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  clientName: string,
  clientAvatarUrl: string | undefined,
  loadImageFromUrl: DrawFeedSurfaceArgs["loadImageFromUrl"],
  options?: {
    borderColor?: string;
    borderWidth?: number;
  }
) {
  const avatarImage = await loadImageFromUrl(clientAvatarUrl);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatarImage) {
    drawCover(
      ctx,
      avatarImage,
      avatarImage.naturalWidth,
      avatarImage.naturalHeight,
      { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 }
    );
  } else {
    ctx.fillStyle = "#555";
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${radius * 1.05}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((clientName || "C").slice(0, 1).toUpperCase(), x, y + radius * 0.04);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();

  ctx.strokeStyle = options?.borderColor ?? "rgba(255,255,255,0.6)";
  ctx.lineWidth = options?.borderWidth ?? Math.max(1, radius * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawMoreIcon(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(x + i * radius * 2.3, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function mediaHeightForAspect(width: number, mediaAspect: DrawFeedSurfaceArgs["mediaAspect"]) {
  if (mediaAspect === "3:4") return width * (4 / 3);
  return width;
}

export function drawVerifiedBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const r = size / 2;
  ctx.fillStyle = "#1877f2";
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1, size * 0.11);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.28, y + size * 0.52);
  ctx.lineTo(x + size * 0.44, y + size * 0.68);
  ctx.lineTo(x + size * 0.72, y + size * 0.34);
  ctx.stroke();
}

export function clipScreen(ctx: CanvasRenderingContext2D, layout: Layout) {
  ctx.save();
  roundedRectPath(
    ctx,
    layout.screen.x,
    layout.screen.y,
    layout.screen.w,
    layout.screen.h,
    layout.screenRadius
  );
  ctx.clip();
}

export function endClip(ctx: CanvasRenderingContext2D) {
  ctx.restore();
}

export function safeHandle(name: string) {
  const normalized = fitText(name || "brand", 18)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return `@${normalized || "brand"}`;
}
