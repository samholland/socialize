import { STORY_VIDEO_EXPORT } from "./constants";
import { loadStoryExportAssets } from "./loadAssets";
import { renderStoryExportFrame } from "./renderFrame";
import type {
  StoryExportImageScene,
  StoryExportVideoScene,
} from "./types";

function pickSupportedMimeType(): string | null {
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

function createExportCanvas(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_VIDEO_EXPORT.width;
  canvas.height = STORY_VIDEO_EXPORT.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create canvas context for video export.");
  }
  return ctx;
}

function waitForVideoEvent(video: HTMLVideoElement, event: "loadedmetadata" | "canplay"): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to load source video for Story export."));
    };
    const cleanup = () => {
      video.removeEventListener(event, onDone);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(event, onDone, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode Story video output."));
    }, "image/png", 1);
  });
}

async function runRecorder(
  ctx: CanvasRenderingContext2D,
  durationMs: number,
  drawTick: (elapsedMs: number, durationMs: number) => void
): Promise<Blob> {
  const canvas = ctx.canvas;
  const mimeType = pickSupportedMimeType();
  if (!mimeType) {
    throw new Error("This browser does not support WebM recording.");
  }

  const stream = canvas.captureStream(STORY_VIDEO_EXPORT.fps);
  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder | null = null;
  let rafId = 0;

  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    const result = await new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder!.onerror = () => {
        reject(new Error("MediaRecorder failed while exporting Story video."));
      };
      recorder!.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        if (!blob.size) {
          reject(new Error("Export produced an empty Story video."));
          return;
        }
        resolve(blob);
      };

      const startedAt = performance.now();
      const frame = () => {
        const elapsed = performance.now() - startedAt;
        const clamped = Math.min(durationMs, elapsed);
        drawTick(clamped, durationMs);
        if (elapsed >= durationMs) {
          recorder!.stop();
          return;
        }
        rafId = window.requestAnimationFrame(frame);
      };

      recorder!.start(250);
      frame();
    });

    return result;
  } finally {
    if (rafId) window.cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
  }
}

export async function exportInstagramStoryImageWebm(
  scene: StoryExportImageScene
): Promise<Blob> {
  const ctx = createExportCanvas();
  const assets = await loadStoryExportAssets(scene);

  return await runRecorder(ctx, STORY_VIDEO_EXPORT.imageDurationMs, (elapsedMs, durationMs) => {
    renderStoryExportFrame(ctx, scene, assets, elapsedMs, durationMs);
  });
}

export async function exportInstagramStoryVideoWebm(
  scene: StoryExportVideoScene
): Promise<Blob> {
  const ctx = createExportCanvas();
  const assets = await loadStoryExportAssets(scene);

  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  video.src = scene.media.url;

  await waitForVideoEvent(video, "loadedmetadata");
  await waitForVideoEvent(video, "canplay");

  const rawDurationMs = Number.isFinite(video.duration)
    ? video.duration * 1000
    : STORY_VIDEO_EXPORT.imageDurationMs;
  const durationMs = Math.max(
    1000,
    Math.min(rawDurationMs, STORY_VIDEO_EXPORT.maxVideoDurationMs)
  );

  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    // User gesture should already exist via export click; continue gracefully if play() rejects.
  }

  try {
    const result = await runRecorder(ctx, durationMs, (elapsedMs, totalMs) => {
      renderStoryExportFrame(
        ctx,
        scene,
        assets,
        elapsedMs,
        totalMs,
        {
          source: video,
          width: video.videoWidth,
          height: video.videoHeight,
          zoom: 1,
        }
      );
    });
    return result;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

// Keep this helper to simplify dev debugging if needed.
export async function exportStoryFramePngFromScene(
  scene: StoryExportImageScene
): Promise<Blob> {
  const ctx = createExportCanvas();
  const assets = await loadStoryExportAssets(scene);
  renderStoryExportFrame(ctx, scene, assets, 0, STORY_VIDEO_EXPORT.imageDurationMs);
  return await blobFromCanvas(ctx.canvas);
}
