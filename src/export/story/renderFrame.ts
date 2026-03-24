import {
  FONT_STACK,
  STORY_LAYOUT,
} from "./constants";
import {
  alphaHex,
  drawCover,
  drawTintedImage,
  drawWrappedText,
  fillRoundedRect,
  fitText,
  normalizeHexColor,
  roundedRectPath,
  strokeRoundedRect,
} from "@/rendering/core/primitives";
import { renderInstagramStorySurface } from "./renderers/renderInstagramStorySurface";
import { renderInstagramReelsSurface } from "./renderers/renderInstagramReelsSurface";
import { renderTikTokSurface } from "./renderers/renderTikTokSurface";
import type { StorySceneModel } from "./sceneModel";
import type {
  StoryExportAssets,
  StoryFrameMediaSource,
} from "./types";

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { frame: Rect; screen: Rect; screenRadius: number; scale: number };

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
  renderInstagramStorySurface({
    ctx,
    scene,
    layout,
    assets,
    elapsedMs,
    durationMs,
    mediaSource,
    helpers: {
      drawStoryMedia,
      drawAvatar,
      drawWrappedText,
      fillRoundedRect,
      drawTintedImage,
      drawFallbackActionIcon,
      drawStoryCtaPill,
      fitText,
    },
  });
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
  if (scene.surface === "instagram-reels") {
    renderInstagramReelsSurface({
      ctx,
      scene,
      layout,
      assets,
      elapsedMs,
      durationMs,
      mediaSource,
      helpers: {
        drawStoryStatusBar,
        drawStoryMedia,
        drawTintedImage,
        drawAvatar,
        drawWrappedText,
        fillRoundedRect,
        strokeRoundedRect,
        drawCover,
        fitText,
      },
    });
    return;
  }
  renderTikTokSurface({
    ctx,
    scene,
    layout,
    assets,
    elapsedMs,
    durationMs,
    mediaSource,
    helpers: {
      drawStoryStatusBar,
      drawStoryMedia,
      drawWrappedText,
      fillRoundedRect,
      drawStoryCtaBar,
    },
  });
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
