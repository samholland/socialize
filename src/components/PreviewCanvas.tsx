"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export type PreviewCanvasHandle = {
  exportCanvas: () => Promise<Blob | null>;
};

type MediaAspect = "1:1" | "3:4" | "9:16";

type Props = {
  primaryText: string;
  cta: string;
  ctaVisible?: boolean;
  ctaBgColor: string;
  ctaTextColor: string;
  platform: string;
  mediaAspect: MediaAspect;
  clientName: string;
  clientVerified?: boolean;
  clientAvatarUrl?: string;
  media: PreviewMedia;
  onMediaChange: (media: PreviewMedia) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

type Layout = {
  frame: Rect;
  screen: Rect;
  screenRadius: number;
  scale: number;
};

const FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const CANVAS_W = 980;
const CANVAS_H = 1520;

const FRAME_NATIVE = { w: 1842, h: 2969 };
const SCREEN_NATIVE = { x: 333, y: 194, w: 1179, h: 2556 };

const FRAME_IMAGE_PATH = "/images/iphone_frame.png";
const FEED_NAV_ICON_PATHS = [
  "/images/ig_home.svg",
  "/images/ig_reels.svg",
  "/images/ig_send.svg",
  "/images/ig_search.svg",
  "/images/ig_pfp_blank.svg",
] as const;
const FEED_ACTION_ICON_PATHS = [
  "/images/ig_heart.svg",
  "/images/ig_comment.svg",
  "/images/ig_send.svg",
  "/images/ig_bookmark.svg",
] as const;
const VERIFIED_ICON_PATH = "/images/ui_verified.svg";

export type PreviewMedia =
  | { kind: "none" }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string };

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

  if (lines.length < maxLines) {
    lines.push(current);
  }

  const consumedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumedWords < words.length) {
    const lastIndex = Math.min(maxLines - 1, lines.length - 1);
    let line = lines[lastIndex] ?? "";
    while (line.length > 0 && ctx.measureText(`${line}...`).width > maxWidth) {
      line = line.slice(0, -1);
    }
    lines[lastIndex] = `${line}...`;
  }

  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function aspectToRatio(aspect: MediaAspect): number {
  if (aspect === "3:4") return 3 / 4;
  if (aspect === "9:16") return 9 / 16;
  return 1;
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

function isStoryLikePlatform(platform: string): boolean {
  const key = platform.toLowerCase();
  return key.includes("story") || key.includes("reels") || key.includes("tiktok");
}

export const PreviewCanvas = forwardRef<PreviewCanvasHandle, Props>(function PreviewCanvas({
  primaryText,
  cta,
  ctaVisible = true,
  ctaBgColor,
  ctaTextColor,
  platform,
  mediaAspect,
  clientName,
  clientVerified = false,
  clientAvatarUrl,
  media,
  onMediaChange,
}: Props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

  useImperativeHandle(ref, () => ({
    async exportCanvas(): Promise<Blob | null> {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      await draw();
      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1)
      );
    },
  }));

  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const frameImageRef = useRef<HTMLImageElement | null>(null);

  const layout = useMemo<Layout>(() => {
    const frameW = 860;
    const frameH = Math.round((frameW * FRAME_NATIVE.h) / FRAME_NATIVE.w);
    const frame: Rect = {
      x: (CANVAS_W - frameW) / 2,
      y: (CANVAS_H - frameH) / 2,
      w: frameW,
      h: frameH,
    };

    const screen: Rect = {
      x: frame.x + frame.w * (SCREEN_NATIVE.x / FRAME_NATIVE.w),
      y: frame.y + frame.h * (SCREEN_NATIVE.y / FRAME_NATIVE.h),
      w: frame.w * (SCREEN_NATIVE.w / FRAME_NATIVE.w),
      h: frame.h * (SCREEN_NATIVE.h / FRAME_NATIVE.h),
    };

    const scale = screen.w / 364;

    return {
      frame,
      screen,
      screenRadius: 42 * scale,
      scale,
    };
  }, []);

  async function loadImageFromUrl(url: string | undefined): Promise<HTMLImageElement | null> {
    if (!url) return null;

    const cached = imageCacheRef.current.get(url);
    if (cached) return cached;

    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        imageCacheRef.current.set(url, image);
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }

  function drawCover(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    dest: Rect
  ) {
    const scale = Math.max(dest.w / srcW, dest.h / srcH);
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

  function drawStatusBar(
    ctx: CanvasRenderingContext2D,
    tone: "light" | "dark"
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
    ctx.fillText("12:13", timeX, timeY);

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

  function drawAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    image: HTMLImageElement | null
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (image) {
      drawCover(ctx, image, image.naturalWidth, image.naturalHeight, {
        x: x - radius,
        y: y - radius,
        w: radius * 2,
        h: radius * 2,
      });
    } else {
      ctx.fillStyle = "#8b929d";
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawFeedHeader(
    ctx: CanvasRenderingContext2D,
    safeClientName: string,
    avatarImage: HTMLImageElement | null,
    verifiedIcon: HTMLImageElement | null
  ) {
    const s = layout.scale;
    const y = layout.screen.y + 44 * s;
    const avatarX = layout.screen.x + 28 * s;
    const nameX = avatarX + 28 * s;

    drawStatusBar(ctx, "dark");

    drawAvatar(ctx, avatarX, y + 26 * s, 18 * s, avatarImage);

    ctx.fillStyle = "#1e2430";
    ctx.font = `700 ${15 * s}px ${FONT_STACK}`;
    ctx.fillText(safeClientName, nameX, y + 24 * s);

    if (verifiedIcon) {
      const iconSize = 12 * s;
      const iconX =
        nameX + Math.min(140 * s, ctx.measureText(safeClientName).width + 10 * s);
      drawTintedImage(
        ctx,
        verifiedIcon,
        {
          x: iconX,
          y: y + 13 * s,
          w: iconSize,
          h: iconSize,
        },
        "#0095f6"
      );
    }

    ctx.fillStyle = "#67707d";
    ctx.font = `500 ${12 * s}px ${FONT_STACK}`;
    ctx.fillText("Sponsored", nameX, y + 40 * s);

    ctx.strokeStyle = "#7d848f";
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.moveTo(layout.screen.x + layout.screen.w - 22 * s, y + 16 * s);
    ctx.lineTo(layout.screen.x + layout.screen.w - 10 * s, y + 28 * s);
    ctx.moveTo(layout.screen.x + layout.screen.w - 10 * s, y + 16 * s);
    ctx.lineTo(layout.screen.x + layout.screen.w - 22 * s, y + 28 * s);
    ctx.stroke();

  }

  function drawStoryHeader(
    ctx: CanvasRenderingContext2D,
    safeClientName: string,
    avatarImage: HTMLImageElement | null,
    platformName: string
  ) {
    const s = layout.scale;
    const plt = platformName.toLowerCase();
    const isTikTok = plt.includes("tiktok");
    const isReels = plt.includes("reels");

    if (isTikTok) {
      // Black background fill
      ctx.fillStyle = "#000000";
      ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

      // Top bar overlay
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 46 * s);
      drawStatusBar(ctx, "light");

      // Tab strip: dim tabs + "For You" active
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

      // "For You" underline
      ctx.font = `700 ${11 * s}px ${FONT_STACK}`;
      const fyW = ctx.measureText("For You").width;
      const fyX = layout.screen.x + layout.screen.w * 0.66 - fyW / 2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(fyX, layout.screen.y + 36 * s, fyW, 2 * s);
      ctx.textAlign = "left";

      // Right action column silhouettes (4 circles)
      const ttColX = layout.screen.x + layout.screen.w - 22 * s;
      const ttColStartY = layout.screen.y + layout.screen.h * 0.42;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i === 0 ? "#fe2c55" : "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(ttColX, ttColStartY + i * 36 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bottom-left handle
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
      ctx.fillText(
        "@" + safeClientName.toLowerCase().replace(/\s/g, ""),
        layout.screen.x + 14 * s,
        layout.screen.y + layout.screen.h - 52 * s
      );

      // TikTok dark bottom nav bar
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(layout.screen.x, layout.screen.y + layout.screen.h - 36 * s, layout.screen.w, 36 * s);
      const ttNavStep = layout.screen.w / 5;
      for (let i = 0; i < 5; i++) {
        const cx = layout.screen.x + ttNavStep * (i + 0.5);
        const cy = layout.screen.y + layout.screen.h - 18 * s;
        if (i === 2) {
          // Plus button (white rectangle with rounded corners)
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

    } else if (isReels) {
      // Black background
      ctx.fillStyle = "#000000";
      ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

      // Top bar overlay
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 46 * s);
      drawStatusBar(ctx, "light");

      // "Reels ▾" centered at top
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${16 * s}px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.fillText("Reels \u25be", layout.screen.x + layout.screen.w / 2, layout.screen.y + 32 * s);
      ctx.textAlign = "left";

      // Right action column (heart, comment, share + avatar at bottom)
      const rlColX = layout.screen.x + layout.screen.w - 22 * s;
      const rlColStartY = layout.screen.y + layout.screen.h * 0.45;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(rlColX, rlColStartY + i * 32 * s, 9 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Avatar at bottom of action col
      drawAvatar(ctx, rlColX, rlColStartY + 3 * 32 * s, 10 * s, avatarImage);

      // Bottom-left: @handle
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
      ctx.fillText(
        "@" + safeClientName.toLowerCase().replace(/\s/g, ""),
        layout.screen.x + 14 * s,
        layout.screen.y + layout.screen.h - 58 * s
      );

      // IG-style bottom nav (dark, 5 icon dots, Reels=index 1 active)
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(layout.screen.x, layout.screen.y + layout.screen.h - 32 * s, layout.screen.w, 32 * s);
      const rlNavStep = layout.screen.w / 5;
      for (let i = 0; i < 5; i++) {
        const cx = layout.screen.x + rlNavStep * (i + 0.5);
        ctx.fillStyle = i === 1 ? "#ffffff" : "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.arc(cx, layout.screen.y + layout.screen.h - 16 * s, 6 * s, 0, Math.PI * 2);
        ctx.fill();
      }

    } else {
      drawStatusBar(ctx, "light");

      // IG Story: progress bar + avatar
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      fillRoundedRect(
        ctx,
        {
          x: layout.screen.x + 14 * s,
          y: layout.screen.y + 26 * s,
          w: layout.screen.w - 28 * s,
          h: 3 * s,
        },
        2 * s
      );

      drawAvatar(ctx, layout.screen.x + 32 * s, layout.screen.y + 90 * s, 18 * s, avatarImage);

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${15 * s}px ${FONT_STACK}`;
      ctx.fillText(fitText(safeClientName, 18), layout.screen.x + 60 * s, layout.screen.y + 86 * s);

      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.font = `500 ${11 * s}px ${FONT_STACK}`;
      ctx.fillText("Sponsored", layout.screen.x + 60 * s, layout.screen.y + 102 * s);

      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.font = `700 ${20 * s}px ${FONT_STACK}`;
      ctx.fillText("x", layout.screen.x + layout.screen.w - 24 * s, layout.screen.y + 53 * s);
    }
  }

  function drawStoryCtaPill(
    ctx: CanvasRenderingContext2D,
    ctaText: string,
    bgColor: string,
    textColor: string
  ) {
    const s = layout.scale;
    const text = fitText(ctaText || "Learn More", 16);
    const width = Math.max(138 * s, ctx.measureText(text).width + 54 * s);
    const height = 38 * s;
    const x = layout.screen.x + (layout.screen.w - width) / 2;
    const y = layout.screen.y + layout.screen.h - 82 * s;

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((-6 * Math.PI) / 180);
    ctx.translate(-(x + width / 2), -(y + height / 2));

    ctx.fillStyle = bgColor;
    fillRoundedRect(
      ctx,
      {
        x,
        y,
        w: width,
        h: height,
      },
      10 * s
    );

    ctx.strokeStyle = textColor;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.arc(x + 20 * s, y + 19 * s, 7 * s, Math.PI * 0.15, Math.PI * 1.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 30 * s, y + 19 * s, 7 * s, Math.PI * 1.15, Math.PI * 2.15);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = `700 ${12 * s}px ${FONT_STACK}`;
    ctx.fillText(text, x + 44 * s, y + 24 * s);
    ctx.restore();
  }

  async function drawStoryFooterActions(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    ss: number,
    tone: string = "#ffffff"
  ) {
    const icons = await Promise.all(
      FEED_ACTION_ICON_PATHS.slice(0, 3).map((path) => loadImageFromUrl(path))
    );
    const size = 22 * ss;
    const gap = 10 * ss;
    const totalWidth = size * 3 + gap * 2;
    const y = layout.screen.y + layout.screen.h - 18 * sy - size;
    let x = layout.screen.x + layout.screen.w - 12 * sx - totalWidth;

    for (const icon of icons) {
      if (icon) {
        drawTintedImage(
          ctx,
          icon,
          { x, y, w: size, h: size },
          tone
        );
      }
      x += size + gap;
    }
  }

  function drawFBHeader(ctx: CanvasRenderingContext2D) {
    const s = layout.scale;
    // White status bar area
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 14 * s);
    drawStatusBar(ctx, "dark");
    // White top bar
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(layout.screen.x, layout.screen.y + 14 * s, layout.screen.w, 34 * s);
    // Bottom border of top bar
    ctx.fillStyle = "#e4e6eb";
    ctx.fillRect(layout.screen.x, layout.screen.y + 48 * s, layout.screen.w, s);
    // "facebook" wordmark in blue
    ctx.fillStyle = "#1877f2";
    ctx.font = `800 ${16 * s}px ${FONT_STACK}`;
    ctx.fillText("facebook", layout.screen.x + 28 * s, layout.screen.y + 38 * s);
    // Hamburger icon hint (3 lines) on left
    ctx.fillStyle = "#65676b";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(layout.screen.x + 10 * s, layout.screen.y + 20 * s + i * 5 * s, 10 * s, 1.5 * s);
    }
  }

  function drawFBBottomNav(ctx: CanvasRenderingContext2D) {
    const s = layout.scale;
    const navH = 44 * s;
    const navY = layout.screen.y + layout.screen.h - navH;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(layout.screen.x, navY, layout.screen.w, navH);
    // Divider
    ctx.fillStyle = "#e4e6eb";
    ctx.fillRect(layout.screen.x, navY, layout.screen.w, s);
    // 5 nav icons as geometric shapes (no emoji)
    const step = layout.screen.w / 5;
    for (let i = 0; i < 5; i++) {
      const cx = layout.screen.x + step * (i + 0.5);
      const cy = navY + navH * 0.45;
      const iconColor = i === 0 ? "#1877f2" : "#65676b";
      ctx.fillStyle = iconColor;
      ctx.strokeStyle = iconColor;
      ctx.lineWidth = Math.max(1, 1.5 * s);
      if (i === 0) {
        // Home: triangle roof + rect body
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7 * s);
        ctx.lineTo(cx - 7 * s, cy - 1 * s);
        ctx.lineTo(cx + 7 * s, cy - 1 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(cx - 4.5 * s, cy - 1 * s, 9 * s, 7 * s);
        // Blue underline for active
        ctx.fillStyle = "#1877f2";
        ctx.fillRect(cx - 12 * s, navY, 24 * s, 2.5 * s);
      } else if (i === 1) {
        // Reels: rounded rect with play triangle inside
        roundedRectPath(ctx, cx - 7 * s, cy - 6 * s, 14 * s, 12 * s, 2 * s);
        ctx.strokeStyle = iconColor;
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
        ctx.fillStyle = iconColor;
        ctx.beginPath();
        ctx.moveTo(cx - 2 * s, cy - 3 * s);
        ctx.lineTo(cx + 4 * s, cy);
        ctx.lineTo(cx - 2 * s, cy + 3 * s);
        ctx.closePath();
        ctx.fill();
      } else if (i === 2) {
        // Friends: two circles stacked
        ctx.beginPath();
        ctx.arc(cx - 3 * s, cy - 2 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 3 * s, cy - 2 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - 9 * s, cy + 2 * s, 10 * s, 4 * s);
        ctx.fillRect(cx - 1 * s, cy + 2 * s, 9 * s, 4 * s);
      } else if (i === 3) {
        // Bell: rounded rect top + handle
        roundedRectPath(ctx, cx - 5 * s, cy - 7 * s, 10 * s, 9 * s, 3 * s);
        ctx.fill();
        ctx.fillRect(cx - 2 * s, cy + 2 * s, 4 * s, 3 * s);
      } else {
        // Menu: 3 horizontal lines
        for (let j = 0; j < 3; j++) {
          ctx.fillRect(cx - 7 * s, cy - 5 * s + j * 5 * s, 14 * s, 2 * s);
        }
      }
    }
  }

  function drawMediaPlaceholder(ctx: CanvasRenderingContext2D, rect: Rect) {
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    grad.addColorStop(0, "#1f2734");
    grad.addColorStop(1, "#3b4558");
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = Math.max(1, layout.scale);
    const step = Math.max(40 * layout.scale, rect.h / 7);
    for (let i = 0; i < 7; i += 1) {
      const y = rect.y + 14 * layout.scale + i * step;
      ctx.beginPath();
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y + step * 0.45);
      ctx.stroke();
    }
  }

  function drawCtaBar(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    ctaText: string,
    bgColor: string,
    textColor: string
  ) {
    const s = layout.scale;

    ctx.fillStyle = bgColor;
    fillRoundedRect(ctx, rect, 0);

    ctx.fillStyle = textColor;
    ctx.font = `700 ${16 * s}px ${FONT_STACK}`;
    ctx.fillText(fitText(ctaText, 16), rect.x + 12 * s, rect.y + rect.h * 0.68);
    ctx.font = `700 ${16 * s}px ${FONT_STACK}`;
    ctx.fillText(">",
      rect.x + rect.w - 21 * s,
      rect.y + rect.h * 0.74
    );
  }

  async function drawFeedMeta(ctx: CanvasRenderingContext2D, safeClientName: string, actionsY: number) {
    const s = layout.scale;
    const captionY = actionsY + 44 * s;
    const [heartIcon, commentIcon, sendIcon, bookmarkIcon] = await Promise.all(
      FEED_ACTION_ICON_PATHS.map((path) => loadImageFromUrl(path))
    );
    const iconSize = 36 * s;

    const drawActionIcon = (image: HTMLImageElement | null, x: number, y: number) => {
      if (image) {
        ctx.drawImage(image, x, y - iconSize / 2, iconSize, iconSize);
        return;
      }
      ctx.fillStyle = "#232830";
      ctx.fillRect(x + 2 * s, y - 8 * s, 16 * s, 16 * s);
    };

    const heartX = layout.screen.x + 16 * s;
    drawActionIcon(heartIcon, heartX, actionsY);

    const heartCountX = heartX + 36 * s;
    const commentX = heartCountX + 28 * s;
    drawActionIcon(commentIcon, commentX, actionsY);

    const commentCountX = commentX + 36 * s;
    const sendX = commentCountX + 28 * s;
    drawActionIcon(sendIcon, sendX, actionsY);

    const bookmarkX = layout.screen.x + layout.screen.w - 16 * s - iconSize;
    drawActionIcon(bookmarkIcon, bookmarkX, actionsY);

    ctx.fillStyle = "#2b323d";
    ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
    ctx.fillText("2.3k", heartCountX, actionsY + 4 * s);
    ctx.fillText("73", commentCountX, actionsY + 4 * s);

    const captionLeft = layout.screen.x + 16 * s;
    const captionRight = layout.screen.x + layout.screen.w - 16 * s;
    const captionLineHeight = 15 * s;
    const captionMaxLines = 4;
    const captionGap = 6 * s;
    const nameText = fitText(safeClientName, 18);
    const bodyText = (primaryText || "Write your campaign body copy to preview it here.")
      .trim()
      .replace(/\s+/g, " ");

    ctx.fillStyle = "#171c24";
    ctx.font = `700 ${14 * s}px ${FONT_STACK}`;
    ctx.fillText(nameText, captionLeft, captionY);

    const nameWidth = ctx.measureText(nameText).width;
    ctx.fillStyle = "#1d2430";
    ctx.font = `400 ${14 * s}px ${FONT_STACK}`;

    const words = bodyText.split(" ").filter(Boolean);
    if (words.length === 0) return;

    let lineIndex = 0;
    let cursorX = captionLeft + nameWidth + captionGap;
    let lineMaxWidth = captionRight - cursorX;

    if (lineMaxWidth < 36 * s) {
      lineIndex = 1;
      cursorX = captionLeft;
      lineMaxWidth = captionRight - captionLeft;
    }

    let wordIndex = 0;
    while (lineIndex < captionMaxLines && wordIndex < words.length) {
      let line = words[wordIndex];
      wordIndex += 1;

      while (wordIndex < words.length) {
        const candidate = `${line} ${words[wordIndex]}`;
        if (ctx.measureText(candidate).width <= lineMaxWidth) {
          line = candidate;
          wordIndex += 1;
          continue;
        }
        break;
      }

      if (wordIndex < words.length && lineIndex === captionMaxLines - 1) {
        while (line.length > 0 && ctx.measureText(`${line}...`).width > lineMaxWidth) {
          line = line.slice(0, -1);
        }
        line = `${line}...`;
      }

      ctx.fillText(line, cursorX, captionY + lineIndex * captionLineHeight);

      lineIndex += 1;
      cursorX = captionLeft;
      lineMaxWidth = captionRight - captionLeft;
    }
  }

  async function drawFeedBottomNav(ctx: CanvasRenderingContext2D) {
    const s = layout.scale;
    const y = layout.screen.y + layout.screen.h - 46 * s;
    const x = layout.screen.x;
    const step = layout.screen.w / 5;
    const icons = await Promise.all(FEED_NAV_ICON_PATHS.map((path) => loadImageFromUrl(path)));

    for (let i = 0; i < icons.length; i += 1) {
      const icon = icons[i];
      const cx = x + step * (i + 0.5);
      const size = 33 * s;

      if (!icon) {
        ctx.fillStyle = "#10151d";
        ctx.beginPath();
        ctx.arc(cx, y, 6 * s, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.drawImage(icon, cx - size / 2, y - size / 2, size, size);
    }
  }

  async function drawPlacedMedia(ctx: CanvasRenderingContext2D, rect: Rect) {
    if (media.kind === "image") {
      const img = await loadImageFromUrl(media.url);
      if (!img) return;
      drawCover(ctx, img, img.naturalWidth, img.naturalHeight, rect);
      return;
    }

    if (media.kind === "video") {
      const vid = videoRef.current;
      if (vid && vid.videoWidth && vid.videoHeight) {
        drawCover(ctx, vid, vid.videoWidth, vid.videoHeight, rect);
      }
    }
  }

  async function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    ctx.fillStyle = "#d8dbe0";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const safeClientName = fitText(clientName || "Client", 18);
    const avatarImage = await loadImageFromUrl(clientAvatarUrl);
    const verifiedIcon = clientVerified && platform === "Instagram Feed"
      ? await loadImageFromUrl(VERIFIED_ICON_PATH)
      : null;
    const resolvedCtaBgColor = normalizeHexColor(ctaBgColor, "#4f94aa");
    const resolvedCtaTextColor = normalizeHexColor(ctaTextColor, "#ffffff");
    const storyMode = isStoryLikePlatform(platform);
    const resolvedAspect: MediaAspect = storyMode ? "9:16" : mediaAspect;

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

  if (storyMode) {
      const plt = platform.toLowerCase();
      const isInstagramStory =
        plt.includes("story") && !plt.includes("reels") && !plt.includes("tiktok");

      if (isInstagramStory) {
        ctx.fillStyle = "#111111";
        ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

        const domWrapperW = 340;
        const domWrapperH = Math.round((domWrapperW * FRAME_NATIVE.h) / FRAME_NATIVE.w);
        const domScreenW = domWrapperW * 0.6402;
        const domScreenH = domWrapperH * 0.8609;
        const sx = layout.screen.w / domScreenW;
        const sy = layout.screen.h / domScreenH;
        const ss = Math.min(sx, sy);

        const mediaRect: Rect = {
          x: layout.screen.x,
          y: layout.screen.y + 28 * sy,
          w: layout.screen.w,
          h: layout.screen.h - (28 + 48) * sy,
        };

        drawMediaPlaceholder(ctx, mediaRect);
        await drawPlacedMedia(ctx, mediaRect);

        const topFade = ctx.createLinearGradient(
          layout.screen.x,
          layout.screen.y,
          layout.screen.x,
          layout.screen.y + 108 * sy
        );
        topFade.addColorStop(0, "rgba(0,0,0,0.24)");
        topFade.addColorStop(0.42, "rgba(0,0,0,0.12)");
        topFade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topFade;
        ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, 108 * sy);

        const barGap = 3 * sx;
        const barX = layout.screen.x + 8 * sx;
        const barY = layout.screen.y + 30 * sy;
        const barW = (layout.screen.w - 16 * sx - barGap * 3) / 4;
        for (let i = 0; i < 4; i += 1) {
          ctx.fillStyle = i < 2 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.25)";
          fillRoundedRect(
            ctx,
            {
              x: barX + i * (barW + barGap),
              y: barY,
              w: barW,
              h: 2 * sy,
            },
            sy
          );
        }

        drawAvatar(
          ctx,
          layout.screen.x + 19 * sx,
          layout.screen.y + 45 * sy,
          9 * ss,
          avatarImage
        );

        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${9 * ss}px ${FONT_STACK}`;
        ctx.fillText(
          fitText(safeClientName, 20),
          layout.screen.x + 34 * sx,
          layout.screen.y + 48 * sy
        );

        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = `500 ${14 * ss}px ${FONT_STACK}`;
        ctx.fillText("⋯", layout.screen.x + layout.screen.w - 28 * sx, layout.screen.y + 48 * sy);
        ctx.fillText("×", layout.screen.x + layout.screen.w - 12 * sx, layout.screen.y + 48 * sy);

        if (primaryText) {
          ctx.fillStyle = "#ffffff";
          ctx.font = `600 ${11 * ss}px ${FONT_STACK}`;
          drawWrappedText(
            ctx,
            primaryText,
            layout.screen.x + 10 * sx,
            layout.screen.y + layout.screen.h - 72 * sy,
            layout.screen.w - 20 * sx,
            2,
            15.4 * sy
          );
        }

        ctx.fillStyle = "#ffffff";
        ctx.font = `500 ${9.5 * ss}px ${FONT_STACK}`;
        ctx.fillText("Ad", layout.screen.x + 12 * sx, layout.screen.y + layout.screen.h - 16 * sy);

        await drawStoryFooterActions(ctx, sx, sy, ss);

        if (ctaVisible) {
          drawStoryCtaPill(
            ctx,
            cta,
            resolvedCtaBgColor,
            resolvedCtaTextColor
          );
        }
      } else {
        const mediaTop = layout.screen.y * layout.scale;
        const mediaHeight = Math.min(
          layout.screen.w / aspectToRatio("9:16"),
          layout.screen.h - 168 * layout.scale
        );
        const mediaRect: Rect = {
          x: layout.screen.x,
          y: mediaTop,
          w: layout.screen.w,
          h: mediaHeight,
        };

        drawMediaPlaceholder(ctx, mediaRect);
        await drawPlacedMedia(ctx, mediaRect);

        drawStoryHeader(ctx, safeClientName, avatarImage, platform);

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
          primaryText || "Write your campaign body copy to preview it here.",
          mediaRect.x + 14 * layout.scale,
          mediaRect.y + mediaRect.h - 84 * layout.scale,
          mediaRect.w - 28 * layout.scale,
          2,
          15 * layout.scale
        );

        drawCtaBar(
          ctx,
          {
            x: mediaRect.x,
            y: mediaRect.y + mediaRect.h + 1 * layout.scale,
            w: mediaRect.w,
            h: 42 * layout.scale,
          },
          cta,
          resolvedCtaBgColor,
          resolvedCtaTextColor
        );
      }
    } else {
      const isFacebook = platform.toLowerCase().includes("facebook");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);

      if (isFacebook) {
        // Facebook: light gray feed bg, white top bar via drawFBHeader
        ctx.fillStyle = "#f0f2f5";
        ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);
        drawFBHeader(ctx);
      } else {
      drawFeedHeader(ctx, safeClientName, avatarImage, verifiedIcon);
      }

      const headerH = isFacebook ? 80 * layout.scale : 96 * layout.scale;
      const mediaRect: Rect = {
        x: layout.screen.x,
        y: layout.screen.y + headerH,
        w: layout.screen.w,
        h: layout.screen.w / aspectToRatio(resolvedAspect),
      };

      drawMediaPlaceholder(ctx, mediaRect);
      await drawPlacedMedia(ctx, mediaRect);

      drawCtaBar(
        ctx,
        {
          x: mediaRect.x,
          y: mediaRect.y + mediaRect.h + 0 * layout.scale,
          w: mediaRect.w,
          h: 46 * layout.scale,
        },
        cta,
        resolvedCtaBgColor,
        resolvedCtaTextColor
      );

      const actionsY = mediaRect.y + mediaRect.h + 72 * layout.scale;
      await drawFeedMeta(ctx, safeClientName, actionsY);
      if (isFacebook) {
        drawFBBottomNav(ctx);
      } else {
        await drawFeedBottomNav(ctx);
      }
    }

    ctx.restore();

    if (frameImageRef.current) {
      ctx.drawImage(
        frameImageRef.current,
        layout.frame.x,
        layout.frame.y,
        layout.frame.w,
        layout.frame.h
      );
    }

    if (isDragging) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `700 ${34 * layout.scale}px ${FONT_STACK}`;
      ctx.fillText("Drop image or video", CANVAS_W * 0.3, CANVAS_H * 0.5);
    }
  }

  useEffect(() => {
    let active = true;

    loadImageFromUrl(FRAME_IMAGE_PATH).then((img) => {
      if (!active) return;
      frameImageRef.current = img;
      setFrameVersion((value) => value + 1);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    primaryText,
    cta,
    ctaBgColor,
    ctaTextColor,
    platform,
    mediaAspect,
    clientName,
    clientVerified,
    clientAvatarUrl,
    media,
    isDragging,
    frameVersion,
  ]);

  useEffect(() => {
    if (media.kind === "video") {
      const vid = videoRef.current;
      if (!vid) return;

      vid.load();
      const tryPlay = () => {
        void vid.play().catch(() => {
          // Ignore autoplay rejections; muted inline playback usually succeeds after load.
        });
      };

      if (vid.readyState >= 2) {
        tryPlay();
        return;
      }

      vid.addEventListener("loadeddata", tryPlay, { once: true });
      return () => vid.removeEventListener("loadeddata", tryPlay);
    }
  }, [media]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    let raf = 0;
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };

    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => cancelAnimationFrame(raf);
    const onSeeked = () => draw();
    const onLoaded = () => draw();

    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("seeked", onSeeked);
    vid.addEventListener("loadeddata", onLoaded);

    return () => {
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("seeked", onSeeked);
      vid.removeEventListener("loadeddata", onLoaded);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.kind]);

  function setFromFile(file: File) {
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("image/")) {
      onMediaChange({ kind: "image", url });
      return;
    }
    if (file.type.startsWith("video/")) {
      onMediaChange({ kind: "video", url });
      return;
    }

    alert("Please drop an image or video file.");
    URL.revokeObjectURL(url);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) setFromFile(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setFromFile(file);
  }

  async function exportPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 1)
    );

    if (!blob) {
      alert("Export failed (canvas could not be converted). Try again.");
      return;
    }

    const url = URL.createObjectURL(blob);

    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);

    const filename = `social-mock_${ts}.png`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  function handleCanvasClick() {
    fileInputRef.current?.click();
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      style={{ position: "relative", display: "inline-block", width: 300 }}
    >
      {/* Hidden file input triggered by clicking placeholder area */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={onPickFile}
        style={{ display: "none" }}
      />

      {media.kind === "video" && (
        <video
          ref={videoRef}
          src={media.url}
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
          style={{ display: "none" }}
        />
      )}

      {/* Canvas — click opens file picker when no media */}
      <canvas
        ref={canvasRef}
        onClick={media.kind === "none" ? handleCanvasClick : undefined}
        style={{
          width: 300,
          display: "block",
          cursor: media.kind === "none" ? "pointer" : "default",
          borderRadius: 0,
        }}
      />

      {/* Upload hint overlay — shown when no media and dragging, or as subtle hint */}
      {isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,122,255,0.12)",
            border: "2px dashed #007aff",
            borderRadius: 8,
            pointerEvents: "none",
            gap: 8,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#007aff" }}>Drop to upload</span>
        </div>
      )}
    </div>
  );
});
