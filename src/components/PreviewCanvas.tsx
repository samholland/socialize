"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MediaAspect = "1:1" | "3:4" | "9:16";

type Props = {
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  platform: string;
  mediaAspect: MediaAspect;
  clientName: string;
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

function isStoryLikePlatform(platform: string): boolean {
  const key = platform.toLowerCase();
  return key.includes("story") || key.includes("tiktok");
}

export function PreviewCanvas({
  primaryText,
  cta,
  ctaBgColor,
  ctaTextColor,
  platform,
  mediaAspect,
  clientName,
  clientAvatarUrl,
  media,
  onMediaChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

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
    avatarImage: HTMLImageElement | null
  ) {
    const s = layout.scale;
    const y = layout.screen.y + 44 * s;
    const avatarX = layout.screen.x + 28 * s;
    const nameX = avatarX + 28 * s;

    ctx.fillStyle = "#12161d";
    ctx.font = `600 ${16 * s}px ${FONT_STACK}`;
    ctx.fillText("12:13", layout.screen.x + 40 * s, layout.screen.y + 36 * s);

    ctx.fillStyle = "#2d3440";
    ctx.fillRect(layout.screen.x + layout.screen.w - 48 * s, layout.screen.y + 10 * s, 7 * s, 10 * s);
    ctx.fillRect(layout.screen.x + layout.screen.w - 38 * s, layout.screen.y + 8 * s, 7 * s, 12 * s);
    ctx.fillRect(layout.screen.x + layout.screen.w - 28 * s, layout.screen.y + 6 * s, 7 * s, 14 * s);
    ctx.strokeStyle = "#2d3440";
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.strokeRect(layout.screen.x + layout.screen.w - 18 * s, layout.screen.y + 8 * s, 12 * s, 8 * s);
    ctx.fillRect(layout.screen.x + layout.screen.w - 5 * s, layout.screen.y + 11 * s, 2 * s, 3 * s);

    drawAvatar(ctx, avatarX, y + 26 * s, 18 * s, avatarImage);

    ctx.fillStyle = "#1e2430";
    ctx.font = `700 ${15 * s}px ${FONT_STACK}`;
    ctx.fillText(safeClientName, nameX, y + 24 * s);

    ctx.fillStyle = "#0a84ff";
    ctx.beginPath();
    const checkX = nameX + Math.min(140 * s, ctx.measureText(safeClientName).width + 16 * s);
    ctx.arc(checkX, y + 19 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();

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
    avatarImage: HTMLImageElement | null
  ) {
    const s = layout.scale;

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    fillRoundedRect(
      ctx,
      {
        x: layout.screen.x + 14 * s,
        y: layout.screen.y + 16 * s,
        w: layout.screen.w - 28 * s,
        h: 3 * s,
      },
      2 * s
    );

    drawAvatar(
      ctx,
      layout.screen.x + 32 * s,
      layout.screen.y + 80 * s,
      18 * s,
      avatarImage
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${15 * s}px ${FONT_STACK}`;
    ctx.fillText(fitText(safeClientName, 18), layout.screen.x + 60 * s, layout.screen.y + 76 * s);

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = `500 ${11 * s}px ${FONT_STACK}`;
    ctx.fillText("Sponsored", layout.screen.x + 60 * s, layout.screen.y + 92 * s);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = `700 ${20 * s}px ${FONT_STACK}`;
    ctx.fillText("x", layout.screen.x + layout.screen.w - 24 * s, layout.screen.y + 43 * s);
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

      const topFade = ctx.createLinearGradient(0, mediaRect.y, 0, mediaRect.y + 130 * layout.scale);
      topFade.addColorStop(0, "rgba(0,0,0,0.18)");
      topFade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topFade;
      ctx.fillRect(mediaRect.x, mediaRect.y, mediaRect.w, 130 * layout.scale);

      const bottomFade = ctx.createLinearGradient(
        0,
        mediaRect.y + mediaRect.h - 180 * layout.scale,
        0,
        mediaRect.y + mediaRect.h
      );
      bottomFade.addColorStop(0, "rgba(0,0,0,0)");
      bottomFade.addColorStop(1, "rgba(0,0,0,0.15)");
      ctx.fillStyle = bottomFade;
      ctx.fillRect(mediaRect.x, mediaRect.y + mediaRect.h - 180 * layout.scale, mediaRect.w, 180 * layout.scale);

      drawStoryHeader(ctx, safeClientName, avatarImage);

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
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(layout.screen.x, layout.screen.y, layout.screen.w, layout.screen.h);
      drawFeedHeader(ctx, safeClientName, avatarImage);

      const mediaRect: Rect = {
        x: layout.screen.x,
        y: layout.screen.y + 96 * layout.scale,
        w: layout.screen.w,
        h: layout.screen.w / aspectToRatio(resolvedAspect),
      };

      drawMediaPlaceholder(ctx, mediaRect);
      await drawPlacedMedia(ctx, mediaRect);

      const fade = ctx.createLinearGradient(0, mediaRect.y, 0, mediaRect.y + mediaRect.h);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.32)");
      ctx.fillStyle = fade;
      ctx.fillRect(mediaRect.x, mediaRect.y, mediaRect.w, mediaRect.h);

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
      await drawFeedBottomNav(ctx);
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
    clientAvatarUrl,
    media,
    isDragging,
    frameVersion,
  ]);

  useEffect(() => {
    if (media.kind === "video") {
      videoRef.current?.load();
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

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      style={{ display: "grid", gap: 10 }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          maxWidth: 540,
          border: "1px solid #ddd",
          borderRadius: 0,
          display: "block",
        }}
      />
      <label
        style={{
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
          fontSize: 14,
          color: "#444",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="file"
          accept="image/*,video/*"
          onChange={onPickFile}
          style={{ display: "none" }}
        />
        <span style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}>
          Choose file
        </span>
        <span>...or drag &amp; drop onto the preview</span>
      </label>

      {media.kind === "video" && (
        <video
          ref={videoRef}
          src={media.url}
          controls
          playsInline
          style={{ width: "100%", maxWidth: 460, borderRadius: 10, border: "1px solid #ddd" }}
        />
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={exportPNG}
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          }}
        >
          Export PNG
        </button>

        <span style={{ fontSize: 13, color: "#666" }}>
          Exports exactly what you see in the preview.
        </span>
      </div>

      
    </div>
  );
}
