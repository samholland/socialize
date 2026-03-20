import {
  FONT_STACK,
  FRAME_NATIVE,
  STORY_LAYOUT,
  STORY_VIDEO_EXPORT,
  SCREEN_NATIVE,
} from "./constants";
import type {
  StoryExportAssets,
  StoryExportScene,
  StoryFrameMediaSource,
} from "./types";

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { frame: Rect; screen: Rect; screenRadius: number };

function roundedRectPath(
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

function fillRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, r: number) {
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  r: number,
  lineWidth: number
) {
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function fitText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}...`;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = words[i];
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines) lines.push(current);

  const consumedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumedWords < words.length) {
    const lastIndex = Math.min(maxLines - 1, lines.length - 1);
    let line = lines[lastIndex] ?? "";
    while (line.length > 0 && ctx.measureText(`${line}...`).width > maxWidth) {
      line = line.slice(0, -1);
    }
    lines[lastIndex] = `${line}...`;
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dest: Rect,
  zoom: number
) {
  const scale = Math.max(dest.w / srcW, dest.h / srcH) * zoom;
  const sw = dest.w / scale;
  const sh = dest.h / scale;
  const sx = (srcW - sw) / 2;
  const sy = (srcH - sh) / 2;
  ctx.drawImage(source, sx, sy, sw, sh, dest.x, dest.y, dest.w, dest.h);
}

function drawTintedImage(
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

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  image: HTMLImageElement | null,
  fallbackInitial: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (image) {
    drawCover(
      ctx,
      image,
      image.naturalWidth,
      image.naturalHeight,
      { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 },
      1
    );
  } else {
    ctx.fillStyle = "#555";
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${radius * 1.05}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackInitial, x, y + radius * 0.04);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function computeLayout(): Layout {
  const frameW = 860;
  const frameH = Math.round((frameW * FRAME_NATIVE.h) / FRAME_NATIVE.w);
  const frame = {
    x: (STORY_VIDEO_EXPORT.width - frameW) / 2,
    y: (STORY_VIDEO_EXPORT.height - frameH) / 2,
    w: frameW,
    h: frameH,
  };
  const screen = {
    x: frame.x + frame.w * (SCREEN_NATIVE.x / FRAME_NATIVE.w),
    y: frame.y + frame.h * (SCREEN_NATIVE.y / FRAME_NATIVE.h),
    w: frame.w * (SCREEN_NATIVE.w / FRAME_NATIVE.w),
    h: frame.h * (SCREEN_NATIVE.h / FRAME_NATIVE.h),
  };
  const scale = screen.w / 364;
  return { frame, screen, screenRadius: 42 * scale };
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

function drawStoryCtaPill(
  ctx: CanvasRenderingContext2D,
  screen: Rect,
  scale: number,
  ctaText: string,
  bgColor: string,
  textColor: string
) {
  const text = fitText(ctaText || "Learn More", 16);
  const width = Math.max(
    STORY_LAYOUT.ctaMinWidth * scale,
    ctx.measureText(text).width + 54 * scale
  );
  const height = STORY_LAYOUT.ctaHeight * scale;
  const x = screen.x + (screen.w - width) / 2;
  const y = screen.y + screen.h - STORY_LAYOUT.ctaYFromBottom * scale;

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((-6 * Math.PI) / 180);
  ctx.translate(-(x + width / 2), -(y + height / 2));

  ctx.fillStyle = normalizeHexColor(bgColor, "#4f94aa");
  fillRoundedRect(ctx, { x, y, w: width, h: height }, STORY_LAYOUT.ctaRadius * scale);

  const resolvedText = normalizeHexColor(textColor, "#ffffff");
  ctx.strokeStyle = resolvedText;
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.arc(x + 20 * scale, y + 19 * scale, 7 * scale, Math.PI * 0.15, Math.PI * 1.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 30 * scale, y + 19 * scale, 7 * scale, Math.PI * 1.15, Math.PI * 2.15);
  ctx.stroke();

  ctx.fillStyle = resolvedText;
  ctx.font = `700 ${12 * scale}px ${FONT_STACK}`;
  ctx.fillText(text, x + 44 * scale, y + 24 * scale);
  ctx.restore();
}

function drawFallbackActionIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.34, 0, Math.PI * 2);
  ctx.stroke();
}

export function renderStoryExportFrame(
  ctx: CanvasRenderingContext2D,
  scene: StoryExportScene,
  assets: StoryExportAssets,
  elapsedMs: number,
  durationMs: number,
  mediaSource?: StoryFrameMediaSource
) {
  const layout = computeLayout();

  ctx.clearRect(0, 0, STORY_VIDEO_EXPORT.width, STORY_VIDEO_EXPORT.height);
  ctx.fillStyle = "#d8dbe0";
  ctx.fillRect(0, 0, STORY_VIDEO_EXPORT.width, STORY_VIDEO_EXPORT.height);

  const domWrapperW = 340;
  const domWrapperH = Math.round((domWrapperW * FRAME_NATIVE.h) / FRAME_NATIVE.w);
  const domScreenW = domWrapperW * 0.6402;
  const domScreenH = domWrapperH * 0.8609;
  const sx = layout.screen.w / domScreenW;
  const sy = layout.screen.h / domScreenH;
  const ss = Math.min(sx, sy);

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

  ctx.fillStyle = "#111111";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

  const mediaRect: Rect = {
    x: layout.screen.x,
    y: layout.screen.y + STORY_LAYOUT.mediaTop * sy,
    w: layout.screen.w,
    h: layout.screen.h - (STORY_LAYOUT.mediaTop + STORY_LAYOUT.mediaBottom) * sy,
  };

  if (mediaSource && mediaSource.width > 0 && mediaSource.height > 0) {
    drawCover(
      ctx,
      mediaSource.source,
      mediaSource.width,
      mediaSource.height,
      mediaRect,
      mediaSource.zoom ?? 1
    );
  } else if (assets.mediaImage) {
    const t = Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs)));
    const zoom = 1 + t * 0.015;
    drawCover(
      ctx,
      assets.mediaImage,
      assets.mediaImage.naturalWidth,
      assets.mediaImage.naturalHeight,
      mediaRect,
      zoom
    );
  } else {
    ctx.fillStyle = "#222";
    ctx.fillRect(mediaRect.x, mediaRect.y, mediaRect.w, mediaRect.h);
  }

  const topFade = ctx.createLinearGradient(
    layout.screen.x,
    layout.screen.y,
    layout.screen.x,
    layout.screen.y + STORY_LAYOUT.topGradientHeight * sy
  );
  topFade.addColorStop(0, "rgba(0,0,0,0.24)");
  topFade.addColorStop(0.42, "rgba(0,0,0,0.12)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(
    layout.screen.x,
    layout.screen.y,
    layout.screen.w,
    STORY_LAYOUT.topGradientHeight * sy
  );

  const barGap = STORY_LAYOUT.progressGap * sx;
  const barX = layout.screen.x + STORY_LAYOUT.progressLeftRight * sx;
  const barY = layout.screen.y + STORY_LAYOUT.progressTop * sy;
  const barW = (layout.screen.w - STORY_LAYOUT.progressLeftRight * 2 * sx - barGap * 3) / 4;
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i < 2 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.25)";
    fillRoundedRect(
      ctx,
      {
        x: barX + i * (barW + barGap),
        y: barY,
        w: barW,
        h: STORY_LAYOUT.progressHeight * sy,
      },
      sy
    );
  }

  drawAvatar(
    ctx,
    layout.screen.x + STORY_LAYOUT.avatarCenterX * sx,
    layout.screen.y + STORY_LAYOUT.avatarCenterY * sy,
    STORY_LAYOUT.avatarRadius * ss,
    assets.avatarImage,
    (scene.clientName || "C").slice(0, 1).toUpperCase()
  );

  ctx.fillStyle = "#fff";
  ctx.font = `700 ${9 * ss}px ${FONT_STACK}`;
  ctx.fillText(
    fitText(scene.clientName || "Client", 20),
    layout.screen.x + STORY_LAYOUT.nameX * sx,
    layout.screen.y + STORY_LAYOUT.nameY * sy
  );

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `500 ${14 * ss}px ${FONT_STACK}`;
  ctx.fillText(
    "⋯",
    layout.screen.x + layout.screen.w - STORY_LAYOUT.menuXFromRight * sx,
    layout.screen.y + STORY_LAYOUT.closeY * sy
  );
  ctx.fillText(
    "×",
    layout.screen.x + layout.screen.w - STORY_LAYOUT.closeXFromRight * sx,
    layout.screen.y + STORY_LAYOUT.closeY * sy
  );

  if (scene.primaryText.trim()) {
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${11 * ss}px ${FONT_STACK}`;
    drawWrappedText(
      ctx,
      scene.primaryText,
      layout.screen.x + STORY_LAYOUT.captionX * sx,
      layout.screen.y + layout.screen.h - STORY_LAYOUT.captionYFromBottom * sy,
      layout.screen.w - STORY_LAYOUT.captionX * 2 * sx,
      STORY_LAYOUT.captionMaxLines,
      STORY_LAYOUT.captionLineHeight * sy
    );
  }

  ctx.fillStyle = "#fff";
  ctx.font = `500 ${9.5 * ss}px ${FONT_STACK}`;
  ctx.fillText(
    "Ad",
    layout.screen.x + STORY_LAYOUT.footerLabelX * sx,
    layout.screen.y + layout.screen.h - STORY_LAYOUT.footerLabelBaselineFromBottom * sy
  );

  const iconSize = STORY_LAYOUT.footerIconSize * ss;
  const iconGap = STORY_LAYOUT.footerIconGap * ss;
  const iconsY = layout.screen.y + layout.screen.h - STORY_LAYOUT.footerIconsBottom * sy - iconSize;
  const iconsTotalW = iconSize * 3 + iconGap * 2;
  let iconX = layout.screen.x + layout.screen.w - STORY_LAYOUT.footerIconsRight * sx - iconsTotalW;
  const icons = [assets.heartIcon, assets.commentIcon, assets.sendIcon];

  for (const icon of icons) {
    if (icon) {
      drawTintedImage(
        ctx,
        icon,
        { x: iconX, y: iconsY, w: iconSize, h: iconSize },
        "#ffffff"
      );
    } else {
      drawFallbackActionIcon(ctx, iconX, iconsY, iconSize);
    }
    iconX += iconSize + iconGap;
  }

  if (scene.ctaVisible) {
    drawStoryCtaPill(
      ctx,
      layout.screen,
      layout.screen.w / domScreenW,
      scene.cta,
      scene.ctaBgColor,
      scene.ctaTextColor
    );
  }

  ctx.restore();

  if (assets.frameImage) {
    ctx.drawImage(assets.frameImage, layout.frame.x, layout.frame.y, layout.frame.w, layout.frame.h);
  } else {
    ctx.strokeStyle = "#111";
    strokeRoundedRect(ctx, layout.frame, 40, 3);
  }
}
