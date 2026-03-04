"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  primaryText: string;
  cta: string;
};

const FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type Media =
  | { kind: "none" }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string };

export function PreviewCanvas({ primaryText, cta }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [media, setMedia] = useState<Media>({ kind: "none" });
  const [isDragging, setIsDragging] = useState(false);

  // Clean up object URLs when replaced/unmounted
  useEffect(() => {
    return () => {
      if (media.kind !== "none") URL.revokeObjectURL(media.url);
    };
  }, [media]);

  const w = 600;
  const h = 600;

  const phone = useMemo(
    () => ({
      x: 180,
      y: 40,
      w: 240,
      h: 520,
      screen: { x: 195, y: 70, w: 210, h: 460 },
      media: { x: 195, y: 120, w: 210, h: 210 },
      captionY: 360,
      cta: { x: 205, y: 420, w: 190, h: 44 },
    }),
    []
  );

  function drawPlaceholder(ctx: CanvasRenderingContext2D) {
    // phone
    ctx.fillStyle = "#111";
    ctx.fillRect(phone.x, phone.y, phone.w, phone.h);

    // screen
    ctx.fillStyle = "#f3f3f3";
    ctx.fillRect(phone.screen.x, phone.screen.y, phone.screen.w, phone.screen.h);

    // media placeholder
    ctx.fillStyle = "#d0d7ff";
    ctx.fillRect(phone.media.x, phone.media.y, phone.media.w, phone.media.h);
  }

  function drawText(ctx: CanvasRenderingContext2D) {
    // caption (simple V1: one line truncation)
    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.font = `400 16px ${FONT_STACK}`;
    const line = primaryText.length > 40 ? primaryText.slice(0, 40) + "…" : primaryText;
    ctx.fillText(line, phone.media.x + 10, phone.captionY);

    // CTA
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(phone.cta.x, phone.cta.y, phone.cta.w, phone.cta.h);

    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.font = `600 16px ${FONT_STACK}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(cta, phone.cta.x + 12, phone.cta.y + 28);
    ctx.font = `600 22px ${FONT_STACK}`;
    ctx.fillText("›", phone.cta.x + phone.cta.w - 18, phone.cta.y + 30);
  }

  function drawCover(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    dest: { x: number; y: number; w: number; h: number }
  ) {
    // cover fit
    const scale = Math.max(dest.w / srcW, dest.h / srcH);
    const sw = dest.w / scale;
    const sh = dest.h / scale;
    const sx = (srcW - sw) / 2;
    const sy = (srcH - sh) / 2;

    ctx.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      dest.x,
      dest.y,
      dest.w,
      dest.h
    );
  }

  async function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = w;
    canvas.height = h;

    // background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    drawPlaceholder(ctx);

    // media
    if (media.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = media.url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image failed to load"));
      });

      drawCover(ctx, img, img.naturalWidth, img.naturalHeight, phone.media);
    }

    if (media.kind === "video") {
      const vid = videoRef.current;
      if (vid && vid.videoWidth && vid.videoHeight) {
        // draw current frame
        drawCover(ctx, vid, vid.videoWidth, vid.videoHeight, phone.media);
      } else {
        // if video not ready yet, keep placeholder
      }
    }

    drawText(ctx);

    // drag overlay hint
    if (isDragging) {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.font = `600 18px ${FONT_STACK}`;
      ctx.fillText("Drop image or video", 210, 310);
    }
  }

  // Redraw when inputs change
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryText, cta, media, isDragging]);

  // If video, keep redrawing while it plays so the frame updates
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
      setMedia({ kind: "image", url });
      return;
    }
    if (file.type.startsWith("video/")) {
      setMedia({ kind: "video", url });
      // allow ref to attach, then nudge load
      setTimeout(() => videoRef.current?.load(), 0);
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

    // Slight delay avoids occasional Safari flakiness
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
      {/* hidden file input for click-to-upload */}
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
        <span>…or drag & drop onto the preview</span>
      </label>

      {/* hidden video element used as a frame source */}
      {media.kind === "video" && (
        <video
          ref={videoRef}
          src={media.url}
          controls
          playsInline
          style={{ width: "100%", maxWidth: 420, borderRadius: 10, border: "1px solid #ddd" }}
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
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid #ddd",
          borderRadius: 12,
          display: "block",
        }}
      />
    </div>
  );
}