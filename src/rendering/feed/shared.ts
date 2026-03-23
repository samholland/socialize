import { FONT_STACK } from "@/components/preview-canvas/constants";
import type { Layout, Rect } from "@/components/preview-canvas/types";
import {
  alphaHex,
  drawCover,
  fillRoundedRect,
  fitText,
  roundedRectPath,
  strokeRoundedRect,
} from "@/rendering/core/primitives";
import type { DrawFeedSurfaceArgs } from "./types";

export { drawWrappedText } from "@/rendering/core/primitives";

export function drawFeedStatusBar(ctx: CanvasRenderingContext2D, layout: Layout) {
  const s = layout.scale;
  const fg = "#1f2430";
  const muted = alphaHex(fg, 0.28);
  const timeX = layout.screen.x + 44 * s;
  const timeY = layout.screen.y + 34 * s;
  const batteryW = 22 * s;
  const batteryH = 12 * s;
  const batteryX = layout.screen.x + layout.screen.w - 58 * s;
  const batteryY = layout.screen.y + 22 * s;
  const capW = 2.5 * s;
  const capH = 5 * s;
  const signalRight = batteryX - 10 * s;
  const signalBaseY = batteryY + batteryH - 0 * s;
  const barW = 2.5 * s;
  const barGap = 2 * s;
  const barHeights = [5, 8, 10, 13].map((value) => value * s);

  ctx.fillStyle = fg;
  ctx.font = `600 ${16 * s}px ${FONT_STACK}`;
  ctx.fillText("11:13", timeX, timeY);

  barHeights.forEach((height, index) => {
    const x =
      signalRight - (barHeights.length - index) * barW - (barHeights.length - 1 - index) * barGap;
    ctx.fillStyle = index === barHeights.length - 1 ? muted : fg;
    fillRoundedRect(
      ctx,
      {
        x,
        y: signalBaseY - height,
        w: barW,
        h: height,
      },
      1.4 * s
    );
  });

  ctx.strokeStyle = fg;
  strokeRoundedRect(
    ctx,
    {
      x: batteryX,
      y: batteryY,
      w: batteryW,
      h: batteryH,
    },
    6 * s,
    Math.max(1, 1.6 * s)
  );

  ctx.fillStyle = muted;
  fillRoundedRect(
    ctx,
    {
      x: batteryX + 2.5 * s,
      y: batteryY + 2.5 * s,
      w: batteryW - 7 * s,
      h: batteryH - 5 * s,
    },
    3 * s
  );

  ctx.fillStyle = fg;
  fillRoundedRect(
    ctx,
    {
      x: batteryX + 2.5 * s,
      y: batteryY + 2.5 * s,
      w: batteryW - 7 * s,
      h: batteryH - 5 * s,
    },
    3 * s
  );

  ctx.fillRect(
    batteryX + batteryW + 1.8 * s,
    batteryY + (batteryH - capH) / 2,
    capW,
    capH
  );
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
  loadImageFromUrl: DrawFeedSurfaceArgs["loadImageFromUrl"]
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

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = Math.max(1, radius * 0.08);
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
