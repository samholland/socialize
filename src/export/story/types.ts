export type StoryLikeSurface = "instagram-story" | "instagram-reels" | "tiktok";

export type StoryExportScene = {
  surface?: StoryLikeSurface;
  clientName: string;
  clientAvatarUrl?: string;
  primaryText: string;
  cta: string;
  ctaVisible: boolean;
  ctaBgColor: string;
  ctaTextColor: string;
  ctaOffsetX?: number;
  ctaOffsetY?: number;
  media: { kind: "image"; url: string } | { kind: "video"; url: string } | { kind: "none" };
};

export type StoryExportMedia =
  | { kind: "none" }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string };

export type StoryExportImageScene = Omit<StoryExportScene, "media"> & {
  media: { kind: "image"; url: string };
};

export type StoryExportVideoScene = Omit<StoryExportScene, "media"> & {
  media: { kind: "video"; url: string };
};

export type StoryFrameMediaSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  zoom?: number;
};

export type StoryExportAssets = {
  frameImage: HTMLImageElement | null;
  avatarImage: HTMLImageElement | null;
  mediaImage: HTMLImageElement | null;
  heartIcon: HTMLImageElement | null;
  commentIcon: HTMLImageElement | null;
  sendIcon: HTMLImageElement | null;
  repostIcon: HTMLImageElement | null;
  storyLinkIcon: HTMLImageElement | null;
  navHomeInactiveIcon: HTMLImageElement | null;
  navReelsActiveIcon: HTMLImageElement | null;
  navSendIcon: HTMLImageElement | null;
  navSearchIcon: HTMLImageElement | null;
  navProfileBlankIcon: HTMLImageElement | null;
};
