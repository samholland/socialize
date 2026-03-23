import { FRAME_NATIVE, SCREEN_NATIVE, STORY_VIDEO_EXPORT } from "./constants";
import type { StoryExportScene, StoryLikeSurface } from "./types";

export const STORY_SCENE_MODEL_VERSION = "story-scene-v1" as const;

type StorySceneCoordinateSpace = {
  unit: "px";
  origin: "top-left";
  width: number;
  height: number;
};

type StorySceneFrameGeometry = {
  frameNative: { w: number; h: number };
  screenNative: { x: number; y: number; w: number; h: number };
};

type StorySceneTiming = {
  defaultImageDurationMs: number;
  maxVideoDurationMs: number;
};

type StorySceneIdentity = {
  clientName: string;
  clientAvatarUrl?: string;
};

type StorySceneCta = {
  label: string;
  visible: boolean;
  bgColor: string;
  textColor: string;
};

type StorySceneTextLayer = {
  primaryText: string;
  cta: StorySceneCta;
};

type StorySceneMediaNone = {
  kind: "none";
};

type StorySceneMediaImage = {
  kind: "image";
  url: string;
  fit: "cover";
  zoom: number;
};

type StorySceneMediaVideo = {
  kind: "video";
  url: string;
  fit: "cover";
  zoom: number;
};

export type StorySceneMedia =
  | StorySceneMediaNone
  | StorySceneMediaImage
  | StorySceneMediaVideo;

export type StorySceneModel = {
  modelVersion: typeof STORY_SCENE_MODEL_VERSION;
  surface: StoryLikeSurface;
  coordinateSpace: StorySceneCoordinateSpace;
  geometry: StorySceneFrameGeometry;
  timing: StorySceneTiming;
  identity: StorySceneIdentity;
  textLayer: StorySceneTextLayer;
  media: StorySceneMedia;
};

function buildStorySceneMedia(scene: StoryExportScene): StorySceneMedia {
  if (scene.media.kind === "image") {
    return {
      kind: "image",
      url: scene.media.url,
      fit: "cover",
      zoom: 1,
    };
  }

  if (scene.media.kind === "video") {
    return {
      kind: "video",
      url: scene.media.url,
      fit: "cover",
      zoom: 1,
    };
  }

  return { kind: "none" };
}

export function buildStorySceneModel(scene: StoryExportScene): StorySceneModel {
  return {
    modelVersion: STORY_SCENE_MODEL_VERSION,
    surface: scene.surface ?? "instagram-story",
    coordinateSpace: {
      unit: "px",
      origin: "top-left",
      width: STORY_VIDEO_EXPORT.width,
      height: STORY_VIDEO_EXPORT.height,
    },
    geometry: {
      frameNative: { ...FRAME_NATIVE },
      screenNative: { ...SCREEN_NATIVE },
    },
    timing: {
      defaultImageDurationMs: STORY_VIDEO_EXPORT.imageDurationMs,
      maxVideoDurationMs: STORY_VIDEO_EXPORT.maxVideoDurationMs,
    },
    identity: {
      clientName: scene.clientName,
      clientAvatarUrl: scene.clientAvatarUrl,
    },
    textLayer: {
      primaryText: scene.primaryText,
      cta: {
        label: scene.cta,
        visible: scene.ctaVisible,
        bgColor: scene.ctaBgColor,
        textColor: scene.ctaTextColor,
      },
    },
    media: buildStorySceneMedia(scene),
  };
}
