import { FONT_STACK } from "../constants";
import type { StorySceneModel } from "../sceneModel";
import type {
  StoryExportAssets,
  StoryFrameMediaSource,
} from "../types";

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { frame: Rect; screen: Rect; screenRadius: number; scale: number };

type ReelsRenderHelpers = {
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
  drawTintedImage: (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    rect: Rect,
    color: string
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
  strokeRoundedRect: (
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    r: number,
    lineWidth: number
  ) => void;
  drawCover: (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    dest: Rect,
    zoom: number
  ) => void;
  fitText: (text: string, maxChars: number) => string;
};

type RenderInstagramReelsSurfaceArgs = {
  ctx: CanvasRenderingContext2D;
  scene: StorySceneModel;
  layout: Layout;
  assets: StoryExportAssets;
  elapsedMs: number;
  durationMs: number;
  mediaSource?: StoryFrameMediaSource;
  helpers: ReelsRenderHelpers;
};

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

function drawReelsHeader(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  helpers: ReelsRenderHelpers
) {
  const s = layout.scale;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 76 * s);
  helpers.drawStoryStatusBar(ctx, layout, "light", "9:40");

  const tabsY = layout.screen.y + 57 * s;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  ctx.moveTo(layout.screen.x + 16 * s, tabsY);
  ctx.lineTo(layout.screen.x + 31 * s, tabsY);
  ctx.moveTo(layout.screen.x + 23.5 * s, tabsY - 7.2 * s);
  ctx.lineTo(layout.screen.x + 23.5 * s, tabsY + 7.2 * s);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${17.2 * s}px ${FONT_STACK}`;
  ctx.fillText("Reels", layout.screen.x + 82 * s, tabsY + 6 * s);

  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = `600 ${16 * s}px ${FONT_STACK}`;
  ctx.fillText("Friends", layout.screen.x + 153 * s, tabsY + 6 * s);

  for (let i = 0; i < 3; i += 1) {
    const r = 6.1 * s;
    const cx = layout.screen.x + 250 * s + i * 10.1 * s;
    const cy = tabsY - 2 * s;
    ctx.fillStyle = i === 1 ? "#c95cff" : i === 2 ? "#ff3b30" : "#f8f8f8";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.6 * s);
  const iconX = layout.screen.x + layout.screen.w - 18 * s;
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
  assets: StoryExportAssets,
  helpers: ReelsRenderHelpers
) {
  const s = layout.scale;
  const colX = layout.screen.x + layout.screen.w - 24 * s;
  const startY = layout.screen.y + layout.screen.h * 0.55;
  const iconSize = 22 * s;
  const itemStep = 53 * s;

  const entries: Array<{ icon: HTMLImageElement | null | undefined; count: string }> = [
    { icon: assets.heartIcon, count: "14.5K" },
    { icon: assets.commentIcon, count: "94" },
    { icon: assets.repostIcon, count: "169" },
    { icon: assets.sendIcon, count: "8,576" },
  ];

  entries.forEach((entry, index) => {
    const top = startY + index * itemStep;
    if (entry.icon) {
      helpers.drawTintedImage(
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

function drawReelsFooter(
  ctx: CanvasRenderingContext2D,
  scene: StorySceneModel,
  layout: Layout,
  assets: StoryExportAssets,
  helpers: ReelsRenderHelpers
) {
  const s = layout.scale;
  const safeName = helpers
    .fitText(scene.identity.clientName || "client", 18)
    .toLowerCase()
    .replace(/\s+/g, "");
  const footerTop = layout.screen.y + layout.screen.h - 150 * s;
  const navH = 70 * s;

  const fade = ctx.createLinearGradient(0, footerTop - 68 * s, 0, footerTop);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = fade;
  ctx.fillRect(layout.screen.x, footerTop - 68 * s, layout.screen.w, 68 * s);

  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.fillRect(layout.screen.x, footerTop, layout.screen.w, layout.screen.h - (footerTop - layout.screen.y));

  helpers.drawAvatar(
    ctx,
    layout.screen.x + 16 * s,
    footerTop + 15.5 * s,
    9.8 * s,
    assets.avatarImage,
    (scene.identity.clientName || "C").slice(0, 1).toUpperCase()
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${10.5 * s}px ${FONT_STACK}`;
  ctx.fillText(safeName, layout.screen.x + 30 * s, footerTop + 13 * s);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `500 ${8.8 * s}px ${FONT_STACK}`;
  ctx.fillText("\u2197  dudebs \u00b7 Garden", layout.screen.x + 30 * s, footerTop + 26 * s);

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  helpers.strokeRoundedRect(
    ctx,
    {
      x: layout.screen.x + 124 * s,
      y: footerTop + 2 * s,
      w: 56 * s,
      h: 22 * s,
    },
    10 * s,
    Math.max(1, 1.6 * s)
  );
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${10 * s}px ${FONT_STACK}`;
  ctx.fillText("Follow", layout.screen.x + 140 * s, footerTop + 16 * s);

  drawMoreIcon(
    ctx,
    layout.screen.x + layout.screen.w - 21 * s,
    footerTop + 12 * s,
    1.5 * s,
    "#ffffff"
  );

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `500 ${8.8 * s}px ${FONT_STACK}`;
  helpers.drawWrappedText(
    ctx,
    scene.textLayer.primaryText || "Write your campaign copy here.",
    layout.screen.x + 14 * s,
    footerTop + 46 * s,
    layout.screen.w - 66 * s,
    1,
    11 * s
  );

  const thumbRect = {
    x: layout.screen.x + layout.screen.w - 30 * s,
    y: footerTop + 31 * s,
    w: 18 * s,
    h: 18 * s,
  };
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  helpers.fillRoundedRect(ctx, thumbRect, 4 * s);
  if (assets.mediaImage) {
    helpers.drawCover(
      ctx,
      assets.mediaImage,
      assets.mediaImage.naturalWidth,
      assets.mediaImage.naturalHeight,
      thumbRect,
      1
    );
  }
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  helpers.strokeRoundedRect(ctx, thumbRect, 4 * s, Math.max(1, 1.2 * s));

  const navY = layout.screen.y + layout.screen.h - navH;
  ctx.fillStyle = "rgba(4,12,24,0.94)";
  ctx.fillRect(layout.screen.x, navY, layout.screen.w, navH);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(layout.screen.x, navY, layout.screen.w, 1 * s);

  const navStep = layout.screen.w / 5;
  const navIcons = [
    assets.navHomeInactiveIcon,
    assets.navReelsActiveIcon,
    assets.navSendIcon,
    assets.navSearchIcon,
    assets.navProfileBlankIcon,
  ];
  const navIconSize = 29 * s;

  navIcons.forEach((icon, index) => {
    if (!icon) return;
    helpers.drawTintedImage(
      ctx,
      icon,
      {
        x: layout.screen.x + navStep * index + (navStep - navIconSize) / 2,
        y: navY + (navH - navIconSize) - 96 / 2,
        w: navIconSize,
        h: navIconSize,
      },
      "#ffffff"
    );
  });
}

export function renderInstagramReelsSurface({
  ctx,
  scene,
  layout,
  assets,
  elapsedMs,
  durationMs,
  mediaSource,
  helpers,
}: RenderInstagramReelsSurfaceArgs) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

  const mediaRect: Rect = {
    x: layout.screen.x,
    y: layout.screen.y,
    w: layout.screen.w,
    h: layout.screen.h,
  };

  helpers.drawStoryMedia(ctx, mediaRect, assets, mediaSource, elapsedMs, durationMs);

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

  drawReelsHeader(ctx, layout, helpers);
  drawReelsActionRail(ctx, layout, assets, helpers);
  drawReelsFooter(ctx, scene, layout, assets, helpers);
}
