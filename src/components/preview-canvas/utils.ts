import type { StoryExportScene, StoryLikeSurface } from "@/export/story/types";
import {
  alphaHex,
  drawCover,
  drawTintedImage,
  fillRoundedRect,
  fitText,
  normalizeHexColor,
  roundedRectPath,
  strokeRoundedRect,
} from "@/rendering/core/primitives";
import type { MediaAspect, PreviewMedia } from "./types";

export {
  alphaHex,
  drawCover,
  drawTintedImage,
  fillRoundedRect,
  fitText,
  normalizeHexColor,
  roundedRectPath,
  strokeRoundedRect,
};

export function toStoryExportMedia(media: PreviewMedia): StoryExportScene["media"] {
  if (media.kind === "image") return { kind: "image", url: media.url };
  if (media.kind === "video") return { kind: "video", url: media.url };
  return { kind: "none" };
}

export function aspectToRatio(aspect: MediaAspect): number {
  if (aspect === "3:4") return 3 / 4;
  if (aspect === "9:16") return 9 / 16;
  return 1;
}

export function storySurfaceFromPlatform(platform: string): StoryLikeSurface | null {
  const key = platform.toLowerCase();
  if (key.includes("tiktok")) return "tiktok";
  if (key.includes("reels")) return "instagram-reels";
  if (key.includes("story")) return "instagram-story";
  return null;
}
