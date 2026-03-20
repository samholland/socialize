import {
  FRAME_IMAGE_PATH,
  STORY_ICON_PATHS,
} from "./constants";
import type { StoryExportAssets, StoryExportScene } from "./types";

const imageCache = new Map<string, HTMLImageElement | null>();

async function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return null;

  const cached = imageCache.get(url);
  if (cached !== undefined) return cached;

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  imageCache.set(url, image);
  return image;
}

export async function loadStoryExportAssets(
  scene: StoryExportScene
): Promise<StoryExportAssets> {
  const mediaImageUrl = scene.media.kind === "image" ? scene.media.url : undefined;
  const [frameImage, avatarImage, mediaImage, heartIcon, commentIcon, sendIcon] =
    await Promise.all([
      loadImage(FRAME_IMAGE_PATH),
      loadImage(scene.clientAvatarUrl),
      loadImage(mediaImageUrl),
      loadImage(STORY_ICON_PATHS.heart),
      loadImage(STORY_ICON_PATHS.comment),
      loadImage(STORY_ICON_PATHS.send),
    ]);

  return {
    frameImage,
    avatarImage,
    mediaImage,
    heartIcon,
    commentIcon,
    sendIcon,
  };
}
