import {
  FONT_STACK,
  STORY_LAYOUT,
} from "../constants";
import type { StorySceneModel } from "../sceneModel";
import type {
  StoryExportAssets,
  StoryFrameMediaSource,
} from "../types";

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { frame: Rect; screen: Rect; screenRadius: number; scale: number };

type InstagramStoryRenderHelpers = {
  drawStoryMedia: (
    ctx: CanvasRenderingContext2D,
    mediaRect: Rect,
    assets: StoryExportAssets,
    mediaSource: StoryFrameMediaSource | undefined,
    elapsedMs: number,
    durationMs: number
  ) => void;
  drawAvatar: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    image: HTMLImageElement | null,
    fallbackInitial: string
  ) => void;
  drawWrappedText: (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxLines: number,
    lineHeight: number
  ) => void;
  fillRoundedRect: (ctx: CanvasRenderingContext2D, rect: Rect, r: number) => void;
  drawTintedImage: (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    rect: Rect,
    color: string
  ) => void;
  drawFallbackActionIcon: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
  ) => void;
  drawStoryCtaPill: (
    ctx: CanvasRenderingContext2D,
    screen: Rect,
    scale: number,
    ctaText: string,
    bgColor: string,
    textColor: string
  ) => void;
  fitText: (text: string, maxChars: number) => string;
};

type RenderInstagramStorySurfaceArgs = {
  ctx: CanvasRenderingContext2D;
  scene: StorySceneModel;
  layout: Layout;
  assets: StoryExportAssets;
  elapsedMs: number;
  durationMs: number;
  mediaSource?: StoryFrameMediaSource;
  helpers: InstagramStoryRenderHelpers;
};

export function renderInstagramStorySurface({
  ctx,
  scene,
  layout,
  assets,
  elapsedMs,
  durationMs,
  mediaSource,
  helpers,
}: RenderInstagramStorySurfaceArgs) {
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

  helpers.drawStoryMedia(ctx, mediaRect, assets, mediaSource, elapsedMs, durationMs);

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
    helpers.fillRoundedRect(
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

  helpers.drawAvatar(
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
    helpers.fitText(scene.identity.clientName || "Client", 20),
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
    helpers.drawWrappedText(
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
      helpers.drawTintedImage(
        ctx,
        icon,
        { x: iconX, y: iconsY, w: iconSize, h: iconSize },
        "#ffffff"
      );
    } else {
      helpers.drawFallbackActionIcon(ctx, iconX, iconsY, iconSize);
    }
    iconX += iconSize + iconGap;
  }

  if (scene.textLayer.cta.visible) {
    helpers.drawStoryCtaPill(
      ctx,
      layout.screen,
      layout.screen.w / domScreenW,
      scene.textLayer.cta.label,
      scene.textLayer.cta.bgColor,
      scene.textLayer.cta.textColor
    );
  }
}
