"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  FACEBOOK_FEED_OVERLAY_PATH,
  CANVAS_H,
  CANVAS_W,
  FONT_STACK,
  FRAME_IMAGE_PATH,
  FRAME_NATIVE,
  INSTAGRAM_FEED_OVERLAY_PATH,
  INSTAGRAM_REELS_OVERLAY_PATH,
  SCREEN_NATIVE,
} from "./preview-canvas/constants";
import { drawFeedSurface } from "@/rendering/feed/renderFeedSurface";
import { drawStoryLikeSurface } from "./preview-canvas/renderStoryLikeSurface";
import {
  isPointInStoryCtaPill,
  type StoryCtaPillLayout,
} from "@/export/story/storyCtaLayout";
import type { Layout, MediaAspect, PreviewMedia, Rect } from "./preview-canvas/types";
import { normalizeHexColor, roundedRectPath, storySurfaceFromPlatform } from "./preview-canvas/utils";

export type { PreviewMedia } from "./preview-canvas/types";

export type PreviewCanvasHandle = {
  exportCanvas: () => Promise<Blob | null>;
  exportVideoWebm: () => Promise<Blob | null>;
};

type Props = {
  primaryText: string;
  facebookPageName?: string;
  headline?: string;
  url?: string;
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
  mockupBackdropColor?: string;
  transparentPngExport?: boolean;
  storyCtaOffsetX?: number;
  storyCtaOffsetY?: number;
  engagementPreset?: "low" | "medium" | "high";
  engagementSeed?: number;
  displayWidth?: number | string;
  disableMediaInteractions?: boolean;
  onStoryCtaOffsetChange?: (offsetX: number, offsetY: number) => void;
  onMediaChange: (media: PreviewMedia) => void;
  onMediaFileSelected?: (file: File) => void;
};

const VIDEO_EXPORT = {
  fps: 30,
  videoBitsPerSecond: 8_000_000,
} as const;

function pickSupportedVideoMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 3) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to load source video."));
    };
    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const target = Math.max(0, timeSec);
  if (Math.abs(video.currentTime - target) < 0.01) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = target;
    } catch {
      cleanup();
      resolve();
    }
  });
}

async function recordCanvasVideoWebmUntilVideoEnds(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  drawFrame: () => void
): Promise<Blob> {
  const mimeType = pickSupportedVideoMimeType();
  if (!mimeType) {
    throw new Error("This browser does not support WebM recording.");
  }

  const stream = canvas.captureStream(VIDEO_EXPORT.fps);
  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder | null = null;
  let rafId = 0;

  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_EXPORT.videoBitsPerSecond,
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder!.onerror = () => {
        reject(new Error("MediaRecorder failed while exporting video."));
      };
      recorder!.onstop = () => {
        const result = new Blob(chunks, { type: "video/webm" });
        if (!result.size) {
          reject(new Error("Export produced an empty video."));
          return;
        }
        resolve(result);
      };
      const stopRecorder = () => {
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
      };
      const onVideoEnded = () => stopRecorder();
      const onVideoError = () => {
        reject(new Error("Source video failed during export."));
      };

      const frame = () => {
        drawFrame();
        rafId = window.requestAnimationFrame(frame);
      };

      video.addEventListener("ended", onVideoEnded, { once: true });
      video.addEventListener("error", onVideoError, { once: true });
      recorder!.start(250);
      frame();
      void video.play().catch(() => {
        stopRecorder();
      });
    });

    return blob;
  } finally {
    if (rafId) window.cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
  }
}

export const PreviewCanvas = forwardRef<PreviewCanvasHandle, Props>(function PreviewCanvas(
  {
    primaryText,
    facebookPageName = "",
    headline = "",
    url = "",
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
    mockupBackdropColor = "#ffffff",
    transparentPngExport = false,
    storyCtaOffsetX = 0,
    storyCtaOffsetY = 0,
    engagementPreset = "medium",
    engagementSeed = 1,
    displayWidth = 340,
    disableMediaInteractions = false,
    onStoryCtaOffsetChange,
    onMediaChange,
    onMediaFileSelected,
  }: Props,
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const drawRef = useRef<
    (includeDebugOverlays?: boolean, transparentBackdrop?: boolean) => Promise<void>
  >(async () => {});
  const storyCtaLayoutRef = useRef<StoryCtaPillLayout | null>(null);
  const ignoreNextCanvasClickRef = useRef(false);
  const storyCtaDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isStoryCtaDragging, setIsStoryCtaDragging] = useState(false);
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

  async function draw(
    includeDebugOverlays = true,
    transparentBackdrop = false
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    if (!transparentBackdrop) {
      ctx.fillStyle = normalizeHexColor(mockupBackdropColor, "#ffffff");
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    const resolvedCtaBgColor = normalizeHexColor(ctaBgColor, "#4f94aa");
    const resolvedCtaTextColor = normalizeHexColor(ctaTextColor, "#ffffff");
    const storySurface = storySurfaceFromPlatform(platform);
    if (platform !== "Instagram Story") {
      storyCtaLayoutRef.current = null;
    }

    if (storySurface) {
      await drawStoryLikeSurface({
        ctx,
        surface: storySurface,
        primaryText,
        cta,
        ctaVisible,
        ctaBgColor: resolvedCtaBgColor,
        ctaTextColor: resolvedCtaTextColor,
        ctaOffsetX: storyCtaOffsetX,
        ctaOffsetY: storyCtaOffsetY,
        engagementPreset,
        engagementSeed,
        clientName,
        clientAvatarUrl,
        media,
        video: videoRef.current,
        frameImage: frameImageRef.current,
        loadImageFromUrl,
        backdropColor: normalizeHexColor(mockupBackdropColor, "#ffffff"),
        transparentBackdrop,
        onStoryCtaLayout:
          platform === "Instagram Story"
            ? (layoutValue) => {
                storyCtaLayoutRef.current = layoutValue;
              }
            : undefined,
      });
    } else {
      storyCtaLayoutRef.current = null;
      await drawFeedSurface({
        ctx,
        layout,
        platform,
        mediaAspect,
        primaryText,
        facebookPageName,
        headline,
        url,
        cta,
        ctaBgColor: resolvedCtaBgColor,
        ctaTextColor: resolvedCtaTextColor,
        clientName,
        clientVerified,
        clientAvatarUrl,
        media,
        video: videoRef.current,
        loadImageFromUrl,
        engagementPreset,
        engagementSeed,
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
          : platformKey === "facebook feed"
            ? FACEBOOK_FEED_OVERLAY_PATH
          : null;
    if (includeDebugOverlays && instagramFeedOverlayEnabled && overlayPath) {
      const overlay = await loadImageFromUrl(overlayPath);
      if (overlay) drawInstagramOverlay(ctx, overlay);
    }

    drawDragOverlay(ctx);
  }
  drawRef.current = draw;

  function pointerToCanvasPoint(
    event: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function onCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (
      platform !== "Instagram Story" ||
      !ctaVisible ||
      !onStoryCtaOffsetChange ||
      !storyCtaLayoutRef.current
    ) {
      return;
    }
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    if (!isPointInStoryCtaPill(storyCtaLayoutRef.current, point.x, point.y)) {
      return;
    }

    event.preventDefault();
    ignoreNextCanvasClickRef.current = true;
    storyCtaDragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startOffsetX: storyCtaOffsetX,
      startOffsetY: storyCtaOffsetY,
    };
    setIsStoryCtaDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = storyCtaDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onStoryCtaOffsetChange) return;
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    const nextX = Math.max(-360, Math.min(360, drag.startOffsetX + (point.x - drag.startX)));
    const nextY = Math.max(-640, Math.min(640, drag.startOffsetY + (point.y - drag.startY)));
    onStoryCtaOffsetChange(Math.round(nextX), Math.round(nextY));
  }

  function stopStoryCtaDrag(pointerId?: number) {
    const drag = storyCtaDragRef.current;
    if (!drag) return;
    if (typeof pointerId === "number" && drag.pointerId !== pointerId) return;
    storyCtaDragRef.current = null;
    setIsStoryCtaDragging(false);
  }

  useImperativeHandle(ref, () => ({
    async exportCanvas(): Promise<Blob | null> {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      await drawRef.current(false, transparentPngExport);
      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1)
      );
    },
    async exportVideoWebm(): Promise<Blob | null> {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || media.kind !== "video") return null;

      const wasPaused = video.paused;
      const previousLoop = video.loop;
      const previousTime = video.currentTime;
      video.loop = false;

      try {
        await waitForVideoReady(video);
        await seekVideo(video, 0);
        return await recordCanvasVideoWebmUntilVideoEnds(canvas, video, () => {
          void drawRef.current(false);
        });
      } finally {
        video.pause();
        video.loop = previousLoop;
        if (Number.isFinite(previousTime)) {
          try {
            await seekVideo(video, previousTime);
          } catch {
            // noop
          }
        }
        if (!wasPaused || previousLoop) {
          void video.play().catch(() => {
            // noop
          });
        }
      }
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
    facebookPageName,
    headline,
    url,
    cta,
    ctaVisible,
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
    mockupBackdropColor,
    transparentPngExport,
    storyCtaOffsetX,
    storyCtaOffsetY,
    engagementPreset,
    engagementSeed,
    isDragging,
    isStoryCtaDragging,
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

  useEffect(() => {
    if (disableMediaInteractions) {
      setIsDragging(false);
    }
  }, [disableMediaInteractions]);

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

  function dispatchSelectedFile(file: File) {
    if (onMediaFileSelected) {
      onMediaFileSelected(file);
      return;
    }
    setFromFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disableMediaInteractions) return;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) dispatchSelectedFile(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (disableMediaInteractions) return;
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (disableMediaInteractions) return;
    setIsDragging(false);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (disableMediaInteractions) return;
    const file = e.target.files?.[0];
    if (file) dispatchSelectedFile(file);
    e.target.value = "";
  }

  function handleCanvasClick() {
    if (disableMediaInteractions) return;
    if (ignoreNextCanvasClickRef.current) {
      ignoreNextCanvasClickRef.current = false;
      return;
    }
    if (media.kind !== "none") return;
    fileInputRef.current?.click();
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      style={{ position: "relative", display: "inline-block", width: displayWidth }}
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
          crossOrigin="anonymous"
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
        onClick={handleCanvasClick}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={(event) => stopStoryCtaDrag(event.pointerId)}
        onPointerCancel={(event) => stopStoryCtaDrag(event.pointerId)}
        onLostPointerCapture={(event) => stopStoryCtaDrag(event.pointerId)}
        style={{
          width: displayWidth,
          display: "block",
          cursor: isStoryCtaDragging
            ? "grabbing"
            : media.kind === "none"
              ? "pointer"
              : "default",
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
