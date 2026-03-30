export const STORY_VIDEO_EXPORT = {
  width: 980,
  height: 1520,
  fps: 30,
  imageDurationMs: 5000,
  maxVideoDurationMs: 15000,
} as const;

export const FRAME_NATIVE = { w: 1842, h: 2969 } as const;
export const SCREEN_NATIVE = { x: 333, y: 194, w: 1179, h: 2556 } as const;

export const FRAME_IMAGE_PATH = "/images/iphone_frame.png";

export const STORY_ICON_PATHS = {
  heart: "/images/ig_heart.svg",
  comment: "/images/ig_comment.svg",
  send: "/images/ig_send.svg",
  repost: "/images/ig_repost.svg",
  storyLink: "/images/ig_story_link.svg",
} as const;

export const STORY_REELS_NAV_ICON_PATHS = {
  homeInactive: "/images/ig_home_inactive.svg",
  reelsActive: "/images/ig_reels_active.svg",
  send: "/images/ig_send.svg",
  search: "/images/ig_search.svg",
  profileBlank: "/images/ig_pfp_blank.svg",
} as const;

export const STORY_TIKTOK_ICON_PATHS = {
  add: "/images/tiktok_add.svg",
  like: "/images/tiktok_like.svg",
  comment: "/images/tiktok_comment.svg",
  bookmark: "/images/tiktok_bookmark.svg",
  share: "/images/tiktok_share.svg",
  home: "/images/tiktok_home.svg",
  discover: "/images/tiktok_discover.svg",
  post: "/images/tiktok_post.svg",
  inbox: "/images/tiktok_inbox.svg",
  profile: "/images/tiktok_profile.svg",
} as const;

export const STORY_LAYOUT = {
  mediaTop: 28,
  mediaBottom: 48,
  topGradientHeight: 108,
  progressLeftRight: 8,
  progressTop: 30,
  progressGap: 3,
  progressHeight: 2,
  avatarCenterX: 19,
  avatarCenterY: 45,
  avatarRadius: 9,
  nameX: 34,
  nameY: 48,
  closeY: 48,
  menuXFromRight: 28,
  closeXFromRight: 12,
  captionX: 10,
  captionYFromBottom: 72,
  captionLineHeight: 15.4,
  captionMaxLines: 2,
  footerLabelX: 12,
  footerLabelBaselineFromBottom: 16,
  footerIconSize: 22,
  footerIconGap: 10,
  footerIconsRight: 12,
  footerIconsBottom: 18,
  ctaYFromBottom: 82,
  ctaHeight: 38,
  ctaMinWidth: 138,
  ctaRadius: 10,
} as const;

export const FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
