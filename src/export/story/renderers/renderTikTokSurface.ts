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
  drawWrappedText: (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxLines: number,
    lineHeight: number
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

function tiktokEngagementCounts(
  preset: "low" | "medium" | "high",
  seed: number
): { likes: string; comments: string; bookmarks: string; shares: string } {
  const rng = mulberry32((seed ^ 0x27d4eb2d) >>> 0 || 1);
  const ranges =
    preset === "high"
      ? {
          likes: [35_000, 900_000],
          comments: [250, 18_000],
          bookmarks: [300, 20_000],
          shares: [120, 12_000],
        }
      : preset === "low"
        ? {
            likes: [80, 8_500],
            comments: [3, 450],
            bookmarks: [4, 750],
            shares: [1, 240],
          }
        : {
            likes: [6_500, 180_000],
            comments: [60, 5_500],
            bookmarks: [75, 8_000],
            shares: [20, 2_800],
          };

  return {
    likes: formatCompactCount(randomInt(rng, ranges.likes[0], ranges.likes[1])),
    comments: formatCompactCount(randomInt(rng, ranges.comments[0], ranges.comments[1])),
    bookmarks: formatCompactCount(randomInt(rng, ranges.bookmarks[0], ranges.bookmarks[1])),
    shares: formatCompactCount(randomInt(rng, ranges.shares[0], ranges.shares[1])),
  };
}

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
  helpers.drawStoryStatusBar(ctx, layout, "auto");

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

  const colX = layout.screen.x + layout.screen.w - 27 * s;
  const colStartY = layout.screen.y + layout.screen.h * 0.53;
  const actionIconSize = 23 * s;
  const actionStep = 57 * s;
  const avatarRadius = 17 * s;
  const avatarY = colStartY - 46 * s;
  const counts = tiktokEngagementCounts(scene.engagement.preset, scene.engagement.seed);
  const actionEntries: Array<{ icon: HTMLImageElement | null; count: string }> = [
    { icon: assets.tiktokLikeIcon, count: counts.likes },
    { icon: assets.tiktokCommentIcon, count: counts.comments },
    { icon: assets.tiktokBookmarkIcon, count: counts.bookmarks },
    { icon: assets.tiktokShareIcon, count: counts.shares },
  ];

  helpers.drawAvatar(
    ctx,
    colX,
    avatarY,
    avatarRadius,
    assets.avatarImage,
    (scene.identity.clientName || "C").slice(0, 1).toUpperCase()
  );
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = Math.max(1, 1.6 * s);
  ctx.beginPath();
  ctx.arc(colX, avatarY, avatarRadius + 0.8 * s, 0, Math.PI * 2);
  ctx.stroke();

  const addSize = 18 * s;
  const addX = colX - addSize / 2;
  const addY = avatarY + avatarRadius - addSize * 0.42;
  if (assets.tiktokAddIcon) {
    ctx.drawImage(assets.tiktokAddIcon, addX, addY, addSize, addSize);
  } else {
    ctx.fillStyle = "#ff2d55";
    ctx.beginPath();
    ctx.arc(colX, addY + addSize / 2, addSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, 1.9 * s);
    ctx.beginPath();
    ctx.moveTo(colX - addSize * 0.2, addY + addSize / 2);
    ctx.lineTo(colX + addSize * 0.2, addY + addSize / 2);
    ctx.moveTo(colX, addY + addSize * 0.3);
    ctx.lineTo(colX, addY + addSize * 0.7);
    ctx.stroke();
  }

  actionEntries.forEach((entry, i) => {
    const y = colStartY + i * actionStep;
    if (entry.icon) {
      helpers.drawTintedImage(
        ctx,
        entry.icon,
        {
          x: colX - actionIconSize / 2,
          y: y - actionIconSize / 2,
          w: actionIconSize,
          h: actionIconSize,
        },
        "#ffffff"
      );
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(colX, y, 8 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `600 ${10.5 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(entry.count, colX, y + 22 * s);
  });
  ctx.textAlign = "left";

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

  const navH = 46 * s;
  const navY = layout.screen.y + layout.screen.h - navH;
  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fillRect(layout.screen.x, navY, layout.screen.w, navH);
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fillRect(layout.screen.x, navY, layout.screen.w, Math.max(1, 1.1 * s));

  const navStep = layout.screen.w / 5;
  const navIconSize = 17 * s;
  const navPostSize = 22 * s;
  const navIcons = [
    assets.tiktokHomeIcon,
    assets.tiktokDiscoverIcon,
    assets.tiktokPostIcon,
    assets.tiktokInboxIcon,
    assets.tiktokProfileIcon,
  ];
  const navLabels = ["Home", "Discover", "", "Inbox", "Profile"];

  for (let i = 0; i < 5; i += 1) {
    const cx = layout.screen.x + navStep * (i + 0.5);
    const iconY = navY + 8 * s;
    const labelY = navY + navH - 5 * s;
    const icon = navIcons[i];
    const isActive = i === 0;
    const iconColor = isActive ? "#ffffff" : "rgba(255,255,255,0.72)";
    if (!icon) {
      ctx.fillStyle = iconColor;
      ctx.beginPath();
      ctx.arc(cx, iconY + navIconSize / 2, 5 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (i === 2) {
      ctx.drawImage(icon, cx - navPostSize / 2, iconY - 1 * s, navPostSize, navPostSize);
    } else {
      helpers.drawTintedImage(
        ctx,
        icon,
        { x: cx - navIconSize / 2, y: iconY, w: navIconSize, h: navIconSize },
        "#ffffff"
      );
    }

    const label = navLabels[i];
    if (!label) continue;
    ctx.fillStyle = iconColor;
    ctx.font = `500 ${8.7 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, labelY);
  }
  ctx.textAlign = "left";
}
