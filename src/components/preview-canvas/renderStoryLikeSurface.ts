import {
  STORY_ICON_PATHS,
  STORY_REELS_NAV_ICON_PATHS,
} from "@/export/story/constants";
import { renderStoryExportFrame } from "@/export/story/renderFrame";
import { buildStorySceneModel } from "@/export/story/sceneModel";
import type {
  StoryExportAssets,
  StoryFrameMediaSource,
  StoryLikeSurface,
} from "@/export/story/types";
import type { PreviewMedia } from "./types";
import { toStoryExportMedia } from "./utils";

type DrawStoryLikeSurfaceArgs = {
  ctx: CanvasRenderingContext2D;
  surface: StoryLikeSurface;
  primaryText: string;
  cta: string;
  ctaVisible: boolean;
  ctaBgColor: string;
  ctaTextColor: string;
  clientName: string;
  clientAvatarUrl?: string;
  media: PreviewMedia;
  video: HTMLVideoElement | null;
  frameImage: HTMLImageElement | null;
  loadImageFromUrl: (url: string | undefined) => Promise<HTMLImageElement | null>;
  backdropColor: string;
  transparentBackdrop: boolean;
};

export async function drawStoryLikeSurface({
  ctx,
  surface,
  primaryText,
  cta,
  ctaVisible,
  ctaBgColor,
  ctaTextColor,
  clientName,
  clientAvatarUrl,
  media,
  video,
  frameImage,
  loadImageFromUrl,
  backdropColor,
  transparentBackdrop,
}: DrawStoryLikeSurfaceArgs) {
  const scene = buildStorySceneModel({
    surface,
    clientName,
    clientAvatarUrl,
    primaryText,
    cta,
    ctaVisible,
    ctaBgColor,
    ctaTextColor,
    media: toStoryExportMedia(media),
  });

  const [
    avatarImage,
    mediaImage,
    heartIcon,
    commentIcon,
    sendIcon,
    repostIcon,
    navHomeInactiveIcon,
    navReelsActiveIcon,
    navSendIcon,
    navSearchIcon,
    navProfileBlankIcon,
  ] = await Promise.all([
    loadImageFromUrl(scene.identity.clientAvatarUrl),
    scene.media.kind === "image" ? loadImageFromUrl(scene.media.url) : Promise.resolve(null),
    loadImageFromUrl(STORY_ICON_PATHS.heart),
    loadImageFromUrl(STORY_ICON_PATHS.comment),
    loadImageFromUrl(STORY_ICON_PATHS.send),
    loadImageFromUrl(STORY_ICON_PATHS.repost),
    loadImageFromUrl(STORY_REELS_NAV_ICON_PATHS.homeInactive),
    loadImageFromUrl(STORY_REELS_NAV_ICON_PATHS.reelsActive),
    loadImageFromUrl(STORY_REELS_NAV_ICON_PATHS.send),
    loadImageFromUrl(STORY_REELS_NAV_ICON_PATHS.search),
    loadImageFromUrl(STORY_REELS_NAV_ICON_PATHS.profileBlank),
  ]);

  const assets: StoryExportAssets = {
    frameImage,
    avatarImage,
    mediaImage,
    heartIcon,
    commentIcon,
    sendIcon,
    repostIcon,
    navHomeInactiveIcon,
    navReelsActiveIcon,
    navSendIcon,
    navSearchIcon,
    navProfileBlankIcon,
  };

  const mediaSource: StoryFrameMediaSource | undefined =
    scene.media.kind === "video" && video && video.videoWidth && video.videoHeight
      ? {
          source: video,
          width: video.videoWidth,
          height: video.videoHeight,
          zoom: scene.media.zoom,
        }
      : undefined;

  const elapsedMs = scene.media.kind === "video" && video ? Math.max(0, video.currentTime * 1000) : 0;
  const durationMs =
    scene.media.kind === "video" && video && Number.isFinite(video.duration)
      ? Math.max(1000, video.duration * 1000)
      : scene.timing.defaultImageDurationMs;

  renderStoryExportFrame(
    ctx,
    scene,
    assets,
    elapsedMs,
    durationMs,
    mediaSource,
    {
      backdropColor,
      transparentBackdrop,
    }
  );
}
