export type StoryExportScene = {
  clientName: string;
  clientAvatarUrl?: string;
  primaryText: string;
  cta: string;
  ctaVisible: boolean;
  ctaBgColor: string;
  ctaTextColor: string;
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
};
