export const FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const CANVAS_W = 980;
export const CANVAS_H = 1520;

export const FRAME_NATIVE = { w: 1842, h: 2969 } as const;
export const SCREEN_NATIVE = { x: 333, y: 194, w: 1179, h: 2556 } as const;

export const FRAME_IMAGE_PATH = "/images/iphone_frame.png";
export const INSTAGRAM_FEED_OVERLAY_PATH = "/images/testing/overlay1.png";
export const INSTAGRAM_REELS_OVERLAY_PATH = "/images/testing/overlay-reels.png";
export const FACEBOOK_FEED_OVERLAY_PATH = "/images/testing/overlay-facebook.png";
export const TIKTOK_OVERLAY_PATH = "/images/testing/overlay-tiktok3.png";
export const VERIFIED_ICON_PATH = "/images/ui_verified.svg";

export const FEED_NAV_ICON_PATHS = [
  "/images/ig_home.svg",
  "/images/ig_reels.svg",
  "/images/ig_send.svg",
  "/images/ig_search.svg",
  "/images/ig_pfp_blank.svg",
] as const;

export const FEED_ACTION_ICON_PATHS = [
  "/images/ig_heart.svg",
  "/images/ig_comment.svg",
  "/images/ig_send.svg",
  "/images/ig_bookmark.svg",
] as const;
