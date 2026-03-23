import type { Layout, MediaAspect, PreviewMedia } from "../types";

export type DrawFeedSurfaceArgs = {
  ctx: CanvasRenderingContext2D;
  layout: Layout;
  platform: string;
  mediaAspect: MediaAspect;
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  clientName: string;
  clientVerified: boolean;
  clientAvatarUrl?: string;
  media: PreviewMedia;
  video: HTMLVideoElement | null;
  loadImageFromUrl: (url: string | undefined) => Promise<HTMLImageElement | null>;
};
