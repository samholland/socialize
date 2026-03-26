import {
  FRAME_IMAGE_PATH,
  STORY_ICON_PATHS,
  STORY_REELS_NAV_ICON_PATHS,
} from "./constants";
import type { StorySceneModel } from "./sceneModel";
import type { StoryExportAssets } from "./types";

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
  scene: StorySceneModel
): Promise<StoryExportAssets> {
  const mediaImageUrl = scene.media.kind === "image" ? scene.media.url : undefined;
  const [
    frameImage,
    avatarImage,
    mediaImage,
    heartIcon,
    commentIcon,
    sendIcon,
    repostIcon,
    storyLinkIcon,
    navHomeInactiveIcon,
    navReelsActiveIcon,
    navSendIcon,
    navSearchIcon,
    navProfileBlankIcon,
  ] =
    await Promise.all([
      loadImage(FRAME_IMAGE_PATH),
      loadImage(scene.identity.clientAvatarUrl),
      loadImage(mediaImageUrl),
      loadImage(STORY_ICON_PATHS.heart),
      loadImage(STORY_ICON_PATHS.comment),
      loadImage(STORY_ICON_PATHS.send),
      loadImage(STORY_ICON_PATHS.repost),
      loadImage(STORY_ICON_PATHS.storyLink),
      loadImage(STORY_REELS_NAV_ICON_PATHS.homeInactive),
      loadImage(STORY_REELS_NAV_ICON_PATHS.reelsActive),
      loadImage(STORY_REELS_NAV_ICON_PATHS.send),
      loadImage(STORY_REELS_NAV_ICON_PATHS.search),
      loadImage(STORY_REELS_NAV_ICON_PATHS.profileBlank),
    ]);

  return {
    frameImage,
    avatarImage,
    mediaImage,
    heartIcon,
    commentIcon,
    sendIcon,
    repostIcon,
    storyLinkIcon,
    navHomeInactiveIcon,
    navReelsActiveIcon,
    navSendIcon,
    navSearchIcon,
    navProfileBlankIcon,
  };
}
