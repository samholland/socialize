import {
  FONT_STACK,
  STORY_LAYOUT,
} from "./constants";
import type { StorySceneModel } from "./sceneModel";
import type {
  StoryExportAssets,
  StoryFrameMediaSource,
} from "./types";

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { frame: Rect; screen: Rect; screenRadius: number; scale: number };

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

function computeLayout(scene: StorySceneModel): Layout {
  const { frameNative, screenNative } = scene.geometry;
  const { width: outputW, height: outputH } = scene.coordinateSpace;
  const frameW = 860;
  const frameH = Math.round((frameW * frameNative.h) / frameNative.w);
  const frame = {
    x: (outputW - frameW) / 2,
    y: (outputH - frameH) / 2,
    w: frameW,
    h: frameH,
  };
  const screen = {
    x: frame.x + frame.w * (screenNative.x / frameNative.w),
    y: frame.y + frame.h * (screenNative.y / frameNative.h),
    w: frame.w * (screenNative.w / frameNative.w),
    h: frame.h * (screenNative.h / frameNative.h),
  };
  const scale = screen.w / 364;
  return { frame, screen, screenRadius: 42 * scale, scale };
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

function alphaHex(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex, "#000000");
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const channel = Math.round(safeAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${normalized}${channel}`;
}

function drawStoryStatusBar(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  tone: "light" | "dark",
  timeLabel = "12:13"
) {
  const s = layout.scale;
  const fg = tone === "light" ? "#ffffff" : "#1f2430";
  const muted = tone === "light" ? "rgba(255,255,255,0.35)" : alphaHex(fg, 0.28);
  const timeX = layout.screen.x + 38 * s;
  const timeY = layout.screen.y + 34 * s;
  const batteryW = 28 * s;
  const batteryH = 14 * s;
  const batteryX = layout.screen.x + layout.screen.w - 58 * s;
  const batteryY = layout.screen.y + 17 * s;
  const capW = 2.5 * s;
  const capH = 5 * s;
  const signalRight = batteryX - 10 * s;
  const signalBaseY = batteryY + batteryH - 1.5 * s;
  const barW = 4 * s;
  const barGap = 2.5 * s;
  const barHeights = [7, 10, 13, 16].map((value) => value * s);

  ctx.fillStyle = fg;
  ctx.font = `600 ${16 * s}px ${FONT_STACK}`;
  ctx.fillText(timeLabel, timeX, timeY);

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

function drawStoryCtaBar(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  rect: Rect,
  ctaText: string,
  bgColor: string,
  textColor: string
) {
  const s = layout.scale;
  ctx.fillStyle = normalizeHexColor(bgColor, "#4f94aa");
  fillRoundedRect(ctx, rect, 0);

  ctx.fillStyle = normalizeHexColor(textColor, "#ffffff");
  ctx.font = `700 ${16 * s}px ${FONT_STACK}`;
  ctx.fillText(fitText(ctaText || "Learn More", 16), rect.x + 12 * s, rect.y + rect.h * 0.68);
  ctx.fillText(">", rect.x + rect.w - 21 * s, rect.y + rect.h * 0.74);
}

function drawFallbackActionIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.34, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMoreIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(x + i * radius * 2.3, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStoryMedia(
  ctx: CanvasRenderingContext2D,
  mediaRect: Rect,
  assets: StoryExportAssets,
  mediaSource: StoryFrameMediaSource | undefined,
  elapsedMs: number,
  durationMs: number
) {
  if (mediaSource && mediaSource.width > 0 && mediaSource.height > 0) {
    drawCover(
      ctx,
      mediaSource.source,
      mediaSource.width,
      mediaSource.height,
      mediaRect,
      mediaSource.zoom ?? 1
    );
    return;
  }

  if (assets.mediaImage) {
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
    return;
  }

  ctx.fillStyle = "#222";
  ctx.fillRect(mediaRect.x, mediaRect.y, mediaRect.w, mediaRect.h);
}

function drawInstagramStorySurface(
  ctx: CanvasRenderingContext2D,
  scene: StorySceneModel,
  layout: Layout,
  assets: StoryExportAssets,
  elapsedMs: number,
  durationMs: number,
  mediaSource?: StoryFrameMediaSource
) {
  const domWrapperW = 340;
  const domWrapperH = Math.round(
    (domWrapperW * scene.geometry.frameNative.h) / scene.geometry.frameNative.w
  );
  const domScreenW = domWrapperW * 0.6402;
  const domScreenH = domWrapperH * 0.8609;
  const sx = layout.screen.w / domScreenW;
  const sy = layout.screen.h / domScreenH;
  const ss = Math.min(sx, sy);

  ctx.fillStyle = "#111111";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

  const mediaRect: Rect = {
    x: layout.screen.x,
    y: layout.screen.y + STORY_LAYOUT.mediaTop * sy,
    w: layout.screen.w,
    h: layout.screen.h - (STORY_LAYOUT.mediaTop + STORY_LAYOUT.mediaBottom) * sy,
  };

  drawStoryMedia(ctx, mediaRect, assets, mediaSource, elapsedMs, durationMs);

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
    (scene.identity.clientName || "C").slice(0, 1).toUpperCase()
  );

  ctx.fillStyle = "#fff";
  ctx.font = `700 ${9 * ss}px ${FONT_STACK}`;
  ctx.fillText(
    fitText(scene.identity.clientName || "Client", 20),
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

  if (scene.textLayer.primaryText.trim()) {
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${11 * ss}px ${FONT_STACK}`;
    drawWrappedText(
      ctx,
      scene.textLayer.primaryText,
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

  if (scene.textLayer.cta.visible) {
    drawStoryCtaPill(
      ctx,
      layout.screen,
      layout.screen.w / domScreenW,
      scene.textLayer.cta.label,
      scene.textLayer.cta.bgColor,
      scene.textLayer.cta.textColor
    );
  }
}

function drawShortVideoHeader(
  ctx: CanvasRenderingContext2D,
  scene: StorySceneModel,
  layout: Layout
) {
  const s = layout.scale;
  const isTikTok = scene.surface === "tiktok";
  const handle = `@${(scene.identity.clientName || "client").toLowerCase().replace(/\s+/g, "")}`;

  if (isTikTok) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 46 * s);
    drawStoryStatusBar(ctx, layout, "light");

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `500 ${11 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    const tabs = ["Following", "Shop", "For You"];
    const tabXs = [0.22, 0.44, 0.66];
    tabs.forEach((tab, i) => {
      if (tab === "For You") {
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${11 * s}px ${FONT_STACK}`;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = `500 ${11 * s}px ${FONT_STACK}`;
      }
      ctx.fillText(tab, layout.screen.x + layout.screen.w * tabXs[i], layout.screen.y + 32 * s);
    });

    ctx.font = `700 ${11 * s}px ${FONT_STACK}`;
    const activeTabW = ctx.measureText("For You").width;
    const activeTabX = layout.screen.x + layout.screen.w * 0.66 - activeTabW / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(activeTabX, layout.screen.y + 36 * s, activeTabW, 2 * s);
    ctx.textAlign = "left";

    const colX = layout.screen.x + layout.screen.w - 22 * s;
    const colStartY = layout.screen.y + layout.screen.h * 0.42;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === 0 ? "#fe2c55" : "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(colX, colStartY + i * 36 * s, 10 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
    ctx.fillText(handle, layout.screen.x + 14 * s, layout.screen.y + layout.screen.h - 52 * s);

    ctx.fillStyle = "rgba(0,0,0,0.88)";
    ctx.fillRect(layout.screen.x, layout.screen.y + layout.screen.h - 36 * s, layout.screen.w, 36 * s);
    const navStep = layout.screen.w / 5;
    for (let i = 0; i < 5; i++) {
      const cx = layout.screen.x + navStep * (i + 0.5);
      const cy = layout.screen.y + layout.screen.h - 18 * s;
      if (i === 2) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        roundedRectPath(ctx, cx - 14 * s, cy - 9 * s, 28 * s, 18 * s, 4 * s);
        ctx.fill();
      } else {
        ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 78 * s);
  drawStoryStatusBar(ctx, layout, "light", "9:40");

  const tabsY = layout.screen.y + 58 * s;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  ctx.moveTo(layout.screen.x + 16 * s, tabsY);
  ctx.lineTo(layout.screen.x + 31 * s, tabsY);
  ctx.moveTo(layout.screen.x + 23.5 * s, tabsY - 7.5 * s);
  ctx.lineTo(layout.screen.x + 23.5 * s, tabsY + 7.5 * s);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${17 * s}px ${FONT_STACK}`;
  ctx.fillText("Reels", layout.screen.x + 84 * s, tabsY + 6 * s);

  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = `600 ${16 * s}px ${FONT_STACK}`;
  ctx.fillText("Friends", layout.screen.x + 157 * s, tabsY + 6 * s);

  for (let i = 0; i < 3; i += 1) {
    const r = 6.2 * s;
    const cx = layout.screen.x + 255 * s + i * 10.2 * s;
    const cy = tabsY - 2 * s;
    ctx.fillStyle = i === 1 ? "#c95cff" : i === 2 ? "#ff3b30" : "#f8f8f8";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.6 * s);
  const iconX = layout.screen.x + layout.screen.w - 21 * s;
  const iconY = tabsY - 7 * s;
  for (let i = 0; i < 2; i += 1) {
    const y = iconY + i * 8 * s;
    ctx.beginPath();
    ctx.moveTo(iconX - 9 * s, y);
    ctx.lineTo(iconX + 7 * s, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(iconX - (i === 0 ? 3 : -2) * s, y, 2.2 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawReelsActionRail(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  assets: StoryExportAssets
) {
  const s = layout.scale;
  const colX = layout.screen.x + layout.screen.w - 28 * s;
  const startY = layout.screen.y + layout.screen.h * 0.57;
  const iconSize = 23 * s;
  const itemStep = 57 * s;

  const entries: Array<{ icon: HTMLImageElement | null | undefined; count: string }> = [
    { icon: assets.heartIcon, count: "14.5K" },
    { icon: assets.commentIcon, count: "94" },
    { icon: null, count: "169" },
    { icon: assets.sendIcon, count: "8,576" },
  ];

  entries.forEach((entry, index) => {
    const top = startY + index * itemStep;
    if (entry.icon) {
      drawTintedImage(
        ctx,
        entry.icon,
        { x: colX - iconSize / 2, y: top - iconSize / 2, w: iconSize, h: iconSize },
        "#ffffff"
      );
    } else {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, 1.9 * s);
      ctx.beginPath();
      ctx.moveTo(colX - 7 * s, top - 5 * s);
      ctx.lineTo(colX + 6 * s, top - 13 * s);
      ctx.lineTo(colX + 4 * s, top - 8 * s);
      ctx.moveTo(colX + 7 * s, top + 5 * s);
      ctx.lineTo(colX - 6 * s, top + 13 * s);
      ctx.lineTo(colX - 4 * s, top + 8 * s);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `600 ${8.8 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(entry.count, colX, top + 18.5 * s);
  });
  ctx.textAlign = "left";
}

function drawInstagramReelsFooter(
  ctx: CanvasRenderingContext2D,
  scene: StorySceneModel,
  layout: Layout,
  assets: StoryExportAssets
) {
  const s = layout.scale;
  const safeName = fitText(scene.identity.clientName || "client", 18).toLowerCase().replace(/\s+/g, "");
  const footerTop = layout.screen.y + layout.screen.h - 138 * s;
  const navH = 40 * s;

  const fade = ctx.createLinearGradient(0, footerTop - 56 * s, 0, footerTop);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = fade;
  ctx.fillRect(layout.screen.x, footerTop - 56 * s, layout.screen.w, 56 * s);

  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.fillRect(layout.screen.x, footerTop, layout.screen.w, layout.screen.h - (footerTop - layout.screen.y));

  drawAvatar(
    ctx,
    layout.screen.x + 16 * s,
    footerTop + 16 * s,
    9.8 * s,
    assets.avatarImage,
    (scene.identity.clientName || "C").slice(0, 1).toUpperCase()
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${10.5 * s}px ${FONT_STACK}`;
  ctx.fillText(`@${safeName}`, layout.screen.x + 30 * s, footerTop + 13 * s);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `500 ${8.8 * s}px ${FONT_STACK}`;
  ctx.fillText("\u2197  dudebs \u00b7 Garden", layout.screen.x + 30 * s, footerTop + 26 * s);

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  strokeRoundedRect(
    ctx,
    {
      x: layout.screen.x + 125 * s,
      y: footerTop + 2 * s,
      w: 58 * s,
      h: 22 * s,
    },
    10 * s,
    Math.max(1, 1.6 * s)
  );
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${10 * s}px ${FONT_STACK}`;
  ctx.fillText("Follow", layout.screen.x + 142 * s, footerTop + 16 * s);

  drawMoreIcon(
    ctx,
    layout.screen.x + layout.screen.w - 21 * s,
    footerTop + 12 * s,
    1.5 * s,
    "#ffffff"
  );

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `500 ${8.8 * s}px ${FONT_STACK}`;
  drawWrappedText(
    ctx,
    scene.textLayer.primaryText || "Write your campaign copy here.",
    layout.screen.x + 14 * s,
    footerTop + 45 * s,
    layout.screen.w - 66 * s,
    1,
    11 * s
  );

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  strokeRoundedRect(
    ctx,
    {
      x: layout.screen.x + layout.screen.w - 30 * s,
      y: footerTop + 31 * s,
      w: 18 * s,
      h: 18 * s,
    },
    4 * s,
    Math.max(1, 1.4 * s)
  );

  const navY = layout.screen.y + layout.screen.h - navH;
  ctx.fillStyle = "rgba(4,12,24,0.94)";
  ctx.fillRect(layout.screen.x, navY, layout.screen.w, navH);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(layout.screen.x, navY, layout.screen.w, 1 * s);

  const navStep = layout.screen.w / 5;
  for (let i = 0; i < 5; i += 1) {
    const cx = layout.screen.x + navStep * (i + 0.5);
    const cy = navY + navH / 2;
    ctx.fillStyle = i === 2 ? "#ff3040" : "rgba(255,255,255,0.92)";
    if (i === 1) {
      fillRoundedRect(ctx, { x: cx - 8 * s, y: cy - 6 * s, w: 16 * s, h: 12 * s }, 3 * s);
      ctx.fillStyle = "#0d1523";
      ctx.beginPath();
      ctx.moveTo(cx - 2 * s, cy - 4 * s);
      ctx.lineTo(cx + 4 * s, cy);
      ctx.lineTo(cx - 2 * s, cy + 4 * s);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, i === 4 ? 5.4 * s : 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShortVideoSurface(
  ctx: CanvasRenderingContext2D,
  scene: StorySceneModel,
  layout: Layout,
  assets: StoryExportAssets,
  elapsedMs: number,
  durationMs: number,
  mediaSource?: StoryFrameMediaSource
) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

  const isReels = scene.surface === "instagram-reels";
  const mediaRect: Rect = isReels
    ? {
        x: layout.screen.x,
        y: layout.screen.y,
        w: layout.screen.w,
        h: layout.screen.h,
      }
    : {
        x: layout.screen.x,
        y: layout.screen.y,
        w: layout.screen.w,
        h: Math.min(layout.screen.w / (9 / 16), layout.screen.h - 168 * layout.scale),
      };

  drawStoryMedia(ctx, mediaRect, assets, mediaSource, elapsedMs, durationMs);

  if (isReels) {
    const topFade = ctx.createLinearGradient(
      layout.screen.x,
      layout.screen.y,
      layout.screen.x,
      layout.screen.y + 160 * layout.scale
    );
    topFade.addColorStop(0, "rgba(0,0,0,0.42)");
    topFade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 160 * layout.scale);

    drawShortVideoHeader(ctx, scene, layout);
    drawReelsActionRail(ctx, layout, assets);
    drawInstagramReelsFooter(ctx, scene, layout, assets);
    return;
  }

  drawShortVideoHeader(ctx, scene, layout);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  fillRoundedRect(
    ctx,
    {
      x: layout.screen.x + layout.screen.w - 92 * layout.scale,
      y: layout.screen.y + 28 * layout.scale,
      w: 76 * layout.scale,
      h: 24 * layout.scale,
    },
    12 * layout.scale
  );

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `500 ${12 * layout.scale}px ${FONT_STACK}`;
  drawWrappedText(
    ctx,
    scene.textLayer.primaryText || "Write your campaign body copy to preview it here.",
    mediaRect.x + 14 * layout.scale,
    mediaRect.y + mediaRect.h - 84 * layout.scale,
    mediaRect.w - 28 * layout.scale,
    2,
    15 * layout.scale
  );

  drawStoryCtaBar(
    ctx,
    layout,
    {
      x: mediaRect.x,
      y: mediaRect.y + mediaRect.h + 1 * layout.scale,
      w: mediaRect.w,
      h: 42 * layout.scale,
    },
    scene.textLayer.cta.label,
    scene.textLayer.cta.bgColor,
    scene.textLayer.cta.textColor
  );
}

export function renderStoryExportFrame(
  ctx: CanvasRenderingContext2D,
  scene: StorySceneModel,
  assets: StoryExportAssets,
  elapsedMs: number,
  durationMs: number,
  mediaSource?: StoryFrameMediaSource
) {
  const layout = computeLayout(scene);
  const { width: outputW, height: outputH } = scene.coordinateSpace;

  ctx.clearRect(0, 0, outputW, outputH);
  ctx.fillStyle = "#d8dbe0";
  ctx.fillRect(0, 0, outputW, outputH);

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

  if (scene.surface === "instagram-story") {
    drawInstagramStorySurface(ctx, scene, layout, assets, elapsedMs, durationMs, mediaSource);
  } else {
    drawShortVideoSurface(ctx, scene, layout, assets, elapsedMs, durationMs, mediaSource);
  }

  ctx.restore();

  if (assets.frameImage) {
    ctx.drawImage(assets.frameImage, layout.frame.x, layout.frame.y, layout.frame.w, layout.frame.h);
  } else {
    ctx.strokeStyle = "#111";
    strokeRoundedRect(ctx, layout.frame, 40, 3);
  }
}
