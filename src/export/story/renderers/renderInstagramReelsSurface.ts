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
    tone: "light" | "dark" | "auto",
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

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  const lo = Math.floor(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${value}`;
}

function reelsEngagementCounts(
  preset: "low" | "medium" | "high",
  seed: number
): { likes: string; comments: string; reposts: string; sends: string } {
  const rng = mulberry32((seed ^ 0x85ebca6b) >>> 0 || 1);
  const ranges =
    preset === "high"
      ? {
          likes: [25_000, 650_000],
          comments: [500, 25_000],
          reposts: [200, 11_000],
          sends: [700, 45_000],
        }
      : preset === "low"
        ? {
            likes: [120, 6_500],
            comments: [8, 650],
            reposts: [3, 220],
            sends: [15, 1_200],
          }
        : {
            likes: [6_500, 120_000],
            comments: [90, 7_500],
            reposts: [35, 1_800],
            sends: [120, 8_500],
          };

  return {
    likes: formatCompactCount(randomInt(rng, ranges.likes[0], ranges.likes[1])),
    comments: formatCompactCount(randomInt(rng, ranges.comments[0], ranges.comments[1])),
    reposts: formatCompactCount(randomInt(rng, ranges.reposts[0], ranges.reposts[1])),
    sends: formatCompactCount(randomInt(rng, ranges.sends[0], ranges.sends[1])),
  };
}

function drawReelsHeader(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  helpers: ReelsRenderHelpers
) {
  const s = layout.scale;

  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 100 * s);
  helpers.drawStoryStatusBar(ctx, layout, "auto");

  const tabsY = layout.screen.y + 79 * s;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  ctx.moveTo(layout.screen.x + 16 * s, tabsY);
  ctx.lineTo(layout.screen.x + 31 * s, tabsY);
  ctx.moveTo(layout.screen.x + 23.5 * s, tabsY - 7.2 * s);
  ctx.lineTo(layout.screen.x + 23.5 * s, tabsY + 7.2 * s);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${22.5 * s}px ${FONT_STACK}`;
  ctx.fillText("Reels", layout.screen.x + 82 * s, tabsY + 6 * s);

  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = `600 ${22.5 * s}px ${FONT_STACK}`;
  ctx.fillText("Friends", layout.screen.x + 153 * s, tabsY + 6 * s);

  for (let i = 0; i < 3; i += 1) {
    const r = 6.1 * s;
    const cx = layout.screen.x + 240 * s + i * 10.1 * s;
    const cy = tabsY - 2 * s;
    ctx.fillStyle = i === 1 ? "#c95cff" : i === 2 ? "#ff3b30" : "#f8f8f8";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.6 * s);
  const iconX = layout.screen.x + layout.screen.w - 28 * s;
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
  scene: StorySceneModel,
  assets: StoryExportAssets,
  helpers: ReelsRenderHelpers
) {
  const s = layout.scale;
  const colX = layout.screen.x + layout.screen.w - 32 * s;
  const startY = layout.screen.y - 80 + layout.screen.h * 0.55;
  const iconSize = 32 * s;
  const itemStep = 67 * s;

  const counts = reelsEngagementCounts(scene.engagement.preset, scene.engagement.seed);
  const entries: Array<{ icon: HTMLImageElement | null | undefined; count: string }> = [
    { icon: assets.heartIcon, count: counts.likes },
    { icon: assets.commentIcon, count: counts.comments },
    { icon: assets.repostIcon, count: counts.reposts },
    { icon: assets.sendIcon, count: counts.sends },
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
      ctx.lineWidth = Math.max(1, 2.9 * s);
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
    ctx.font = `600 ${11 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(entry.count, colX, top + 30.5 * s);
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
  fade.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = fade;
  ctx.fillRect(layout.screen.x, footerTop - 68 * s, layout.screen.w, 68 * s);

  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(layout.screen.x, footerTop, layout.screen.w, layout.screen.h - (footerTop - layout.screen.y));

  helpers.drawAvatar(
    ctx,
    layout.screen.x + 30 * s,
    footerTop + 12 * s,
    18 * s,
    assets.avatarImage,
    (scene.identity.clientName || "C").slice(0, 1).toUpperCase()
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${14 * s}px ${FONT_STACK}`;
  ctx.fillText(safeName, layout.screen.x + 58 * s, footerTop + 9 * s);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `500 ${12 * s}px ${FONT_STACK}`;
  ctx.fillText("\u2197  dudebs \u00b7 Garden", layout.screen.x + 58 * s, footerTop + 26 * s);


  drawMoreIcon(
    ctx,
    layout.screen.x + layout.screen.w - 35 * s,
    footerTop + 6 * s,
    2 * s,
    "#ffffff"
  );

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `500 ${14 * s}px ${FONT_STACK}`;
  helpers.drawWrappedText(
    ctx,
    scene.textLayer.primaryText || "Write your campaign copy here.",
    layout.screen.x + 12 * s,
    footerTop + 56 * s,
    layout.screen.w - 66 * s,
    1,
    11 * s
  );

  const thumbRect = {
    x: layout.screen.x + layout.screen.w - 44 * s,
    y: footerTop + 36 * s,
    w: 26 * s,
    h: 26 * s,
  };
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  helpers.fillRoundedRect(ctx, thumbRect, 8 * s);
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
  helpers.strokeRoundedRect(ctx, thumbRect, 4 * s, Math.max(1, 2.2 * s));

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
  topFade.addColorStop(0, "rgba(0,0,0,0.12)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 160 * layout.scale);

  drawReelsHeader(ctx, layout, helpers);
  drawReelsActionRail(ctx, layout, scene, assets, helpers);
  drawReelsFooter(ctx, scene, layout, assets, helpers);
}
