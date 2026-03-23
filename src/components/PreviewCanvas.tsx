"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  FONT_STACK,
  FRAME_IMAGE_PATH,
  FRAME_NATIVE,
  INSTAGRAM_FEED_OVERLAY_PATH,
  INSTAGRAM_REELS_OVERLAY_PATH,
  SCREEN_NATIVE,
} from "./preview-canvas/constants";
import { drawFeedSurface } from "./preview-canvas/renderFeedSurface";
import { drawStoryLikeSurface } from "./preview-canvas/renderStoryLikeSurface";
import type { Layout, MediaAspect, PreviewMedia, Rect } from "./preview-canvas/types";
import { normalizeHexColor, roundedRectPath, storySurfaceFromPlatform } from "./preview-canvas/utils";

export type { PreviewMedia } from "./preview-canvas/types";

export type PreviewCanvasHandle = {
  exportCanvas: () => Promise<Blob | null>;
};

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
  instagramFeedOverlayEnabled?: boolean;
  instagramFeedOverlayOpacity?: number;
  instagramFeedOverlayScale?: number;
  instagramFeedOverlayOffsetX?: number;
  instagramFeedOverlayOffsetY?: number;
  onMediaChange: (media: PreviewMedia) => void;
};

export const PreviewCanvas = forwardRef<PreviewCanvasHandle, Props>(function PreviewCanvas(
  {
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
    instagramFeedOverlayEnabled = false,
    instagramFeedOverlayOpacity = 0.4,
    instagramFeedOverlayScale = 1,
    instagramFeedOverlayOffsetX = 0,
    instagramFeedOverlayOffsetY = 0,
    onMediaChange,
  }: Props,
  ref
) {
  const DISPLAY_WIDTH = 340;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const drawRef = useRef<(includeDebugOverlays?: boolean) => Promise<void>>(async () => {});

  const [isDragging, setIsDragging] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

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
    return { frame, screen, screenRadius: 42 * scale, scale };
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

  function drawDragOverlay(ctx: CanvasRenderingContext2D) {
    if (!isDragging) return;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `700 ${34 * layout.scale}px ${FONT_STACK}`;
    ctx.fillText("Drop image or video", CANVAS_W * 0.3, CANVAS_H * 0.5);
  }

  function drawInstagramOverlay(ctx: CanvasRenderingContext2D, overlay: HTMLImageElement) {
    const opacity = Math.max(0, Math.min(1, instagramFeedOverlayOpacity));
    const overlayScale = Math.max(0.1, instagramFeedOverlayScale);
    if (opacity <= 0) return;

    const coverScale = Math.max(
      layout.screen.w / overlay.naturalWidth,
      layout.screen.h / overlay.naturalHeight
    );
    const width = overlay.naturalWidth * coverScale * overlayScale;
    const height = overlay.naturalHeight * coverScale * overlayScale;
    const x = layout.screen.x + (layout.screen.w - width) / 2 + instagramFeedOverlayOffsetX;
    const y = layout.screen.y + (layout.screen.h - height) / 2 + instagramFeedOverlayOffsetY;

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
    ctx.globalAlpha = opacity;
    ctx.drawImage(overlay, x, y, width, height);
    ctx.restore();
  }

  async function draw(includeDebugOverlays = true) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    ctx.fillStyle = "#d8dbe0";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const resolvedCtaBgColor = normalizeHexColor(ctaBgColor, "#4f94aa");
    const resolvedCtaTextColor = normalizeHexColor(ctaTextColor, "#ffffff");
    const storySurface = storySurfaceFromPlatform(platform);

    if (storySurface) {
      await drawStoryLikeSurface({
        ctx,
        surface: storySurface,
        primaryText,
        cta,
        ctaVisible,
        ctaBgColor: resolvedCtaBgColor,
        ctaTextColor: resolvedCtaTextColor,
        clientName,
        clientAvatarUrl,
        media,
        video: videoRef.current,
        frameImage: frameImageRef.current,
        loadImageFromUrl,
      });
    } else {
      await drawFeedSurface({
        ctx,
        layout,
        platform,
        mediaAspect,
        primaryText,
        cta,
        ctaBgColor: resolvedCtaBgColor,
        ctaTextColor: resolvedCtaTextColor,
        clientName,
        clientVerified,
        clientAvatarUrl,
        media,
        video: videoRef.current,
        loadImageFromUrl,
      });

      if (frameImageRef.current) {
        ctx.drawImage(
          frameImageRef.current,
          layout.frame.x,
          layout.frame.y,
          layout.frame.w,
          layout.frame.h
        );
      }
    }

    const platformKey = platform.toLowerCase();
    const overlayPath =
      platformKey === "instagram feed"
        ? INSTAGRAM_FEED_OVERLAY_PATH
        : platformKey === "instagram reels"
          ? INSTAGRAM_REELS_OVERLAY_PATH
          : null;
    if (includeDebugOverlays && instagramFeedOverlayEnabled && overlayPath) {
      const overlay = await loadImageFromUrl(overlayPath);
      if (overlay) drawInstagramOverlay(ctx, overlay);
    }

    drawDragOverlay(ctx);
  }
  drawRef.current = draw;

  useImperativeHandle(ref, () => ({
    async exportCanvas(): Promise<Blob | null> {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      await drawRef.current(false);
      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1)
      );
    },
  }));

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
    void draw();
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
    instagramFeedOverlayEnabled,
    instagramFeedOverlayOpacity,
    instagramFeedOverlayScale,
    instagramFeedOverlayOffsetX,
    instagramFeedOverlayOffsetY,
    isDragging,
    frameVersion,
  ]);

  useEffect(() => {
    if (media.kind !== "video") return;
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
  }, [media]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    let raf = 0;
    const tick = () => {
      void drawRef.current();
      raf = requestAnimationFrame(tick);
    };

    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => cancelAnimationFrame(raf);
    const onSeeked = () => void drawRef.current();
    const onLoaded = () => void drawRef.current();

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

  function handleCanvasClick() {
    fileInputRef.current?.click();
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      style={{ position: "relative", display: "inline-block", width: DISPLAY_WIDTH }}
    >
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

      <canvas
        ref={canvasRef}
        onClick={media.kind === "none" ? handleCanvasClick : undefined}
        style={{
          width: DISPLAY_WIDTH,
          display: "block",
          cursor: media.kind === "none" ? "pointer" : "default",
          borderRadius: 0,
        }}
      />

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
