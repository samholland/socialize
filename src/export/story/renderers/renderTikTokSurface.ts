import { FONT_STACK } from "../constants";
import type { StorySceneModel } from "../sceneModel";
import type {
  StoryExportAssets,
  StoryFrameMediaSource,
} from "../types";

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { frame: Rect; screen: Rect; screenRadius: number; scale: number };

type TikTokRenderHelpers = {
  drawStoryStatusBar: (
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    tone: "light" | "dark",
    timeLabel?: string
  ) => void;
  drawStoryMedia: (
    ctx: CanvasRenderingContext2D,
    mediaRect: Rect,
    assets: StoryExportAssets,
    mediaSource: StoryFrameMediaSource | undefined,
    elapsedMs: number,
    durationMs: number
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
  drawStoryCtaBar: (
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    rect: Rect,
    ctaText: string,
    bgColor: string,
    textColor: string
  ) => void;
};

type RenderTikTokSurfaceArgs = {
  ctx: CanvasRenderingContext2D;
  scene: StorySceneModel;
  layout: Layout;
  assets: StoryExportAssets;
  elapsedMs: number;
  durationMs: number;
  mediaSource?: StoryFrameMediaSource;
  helpers: TikTokRenderHelpers;
};

export function renderTikTokSurface({
  ctx,
  scene,
  layout,
  assets,
  elapsedMs,
  durationMs,
  mediaSource,
  helpers,
}: RenderTikTokSurfaceArgs) {
  const s = layout.scale;
  const handle = `@${(scene.identity.clientName || "client").toLowerCase().replace(/\s+/g, "")}`;

  ctx.fillStyle = "#000000";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

  const mediaRect: Rect = {
    x: layout.screen.x,
    y: layout.screen.y,
    w: layout.screen.w,
    h: Math.min(layout.screen.w / (9 / 16), layout.screen.h - 168 * s),
  };

  helpers.drawStoryMedia(ctx, mediaRect, assets, mediaSource, elapsedMs, durationMs);

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 46 * s);
  helpers.drawStoryStatusBar(ctx, layout, "light");

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
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i === 0 ? "#fe2c55" : "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(colX, colStartY + i * 36 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  helpers.fillRoundedRect(
    ctx,
    {
      x: layout.screen.x + layout.screen.w - 92 * s,
      y: layout.screen.y + 28 * s,
      w: 76 * s,
      h: 24 * s,
    },
    12 * s
  );

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `500 ${12 * s}px ${FONT_STACK}`;
  helpers.drawWrappedText(
    ctx,
    scene.textLayer.primaryText || "Write your campaign body copy to preview it here.",
    mediaRect.x + 14 * s,
    mediaRect.y + mediaRect.h - 84 * s,
    mediaRect.w - 28 * s,
    2,
    15 * s
  );

  helpers.drawStoryCtaBar(
    ctx,
    layout,
    {
      x: mediaRect.x,
      y: mediaRect.y + mediaRect.h + 1 * s,
      w: mediaRect.w,
      h: 42 * s,
    },
    scene.textLayer.cta.label,
    scene.textLayer.cta.bgColor,
    scene.textLayer.cta.textColor
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
  ctx.fillText(handle, layout.screen.x + 14 * s, layout.screen.y + layout.screen.h - 52 * s);

  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fillRect(layout.screen.x, layout.screen.y + layout.screen.h - 36 * s, layout.screen.w, 36 * s);
  const navStep = layout.screen.w / 5;
  for (let i = 0; i < 5; i += 1) {
    const cx = layout.screen.x + navStep * (i + 0.5);
    const cy = layout.screen.y + layout.screen.h - 18 * s;
    if (i === 2) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      helpers.fillRoundedRect(
        ctx,
        {
          x: cx - 14 * s,
          y: cy - 9 * s,
          w: 28 * s,
          h: 18 * s,
        },
        4 * s
      );
    } else {
      ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
