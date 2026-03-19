"use client";

import type { PreviewMedia } from "./PreviewCanvas";

export type StoryFeedScrollProps = {
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  clientName: string;
  clientAvatarUrl?: string;
  media: PreviewMedia;

};

// Fake story avatars in the tray above
const FAKE_STORIES = [
  { name: "emily_c", color: "#e8a87c" },
  { name: "jack.v", color: "#85c1e9" },
  { name: "urbanshot", color: "#82e0aa" },
  { name: "mia.art", color: "#c39bd3" },
];

export function StoryFeedScroll({
  primaryText,
  cta,
  ctaBgColor,
  ctaTextColor,
  clientName,
  clientAvatarUrl,
  media,

}: StoryFeedScrollProps) {
  const WRAPPER_W = 300;
  const WRAPPER_H = Math.round(300 * (2969 / 1842)); // ≈ 484

  const hasMedia = media.kind === "image" || media.kind === "video";

  return (
    <div
      className="feed-wrapper"
      style={{ width: WRAPPER_W, height: WRAPPER_H, position: "relative" }}
    >
      {/* iPhone frame overlay */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/iphone_frame.png"
        alt=""
        className="feed-frame-img"
        draggable={false}
      />

      {/* Screen content */}
      <div
        className="feed-screen story-screen"

      >
        {/* Story progress bars */}
        <div className="story-progress-bars">
          <div className="story-bar story-bar-done" />
          <div className="story-bar story-bar-active">
            <div className="story-bar-fill" style={{ width: "42%" }} />
          </div>
          <div className="story-bar story-bar-empty" />
        </div>

        {/* Story header */}
        <div className="story-header">
          <div className="story-avatar-wrap">
            {clientAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clientAvatarUrl} alt="" className="story-avatar-img" draggable={false} />
            ) : (
              <div
                className="story-avatar-img"
                style={{ background: "#555", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}
              >
                {clientName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="story-header-info">
            <span className="story-username">{clientName}</span>
            <span className="story-sponsored">Sponsored</span>
          </div>
          <div style={{ flex: 1 }} />
          <span className="story-header-icon">✕</span>
          <span className="story-header-icon" style={{ marginLeft: 8 }}>⋯</span>
        </div>

        {/* Full-bleed media */}
        <div className="story-media">
          {hasMedia ? (
            media.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                draggable={false}
              />
            ) : (
              <video
                src={media.url}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                playsInline
                autoPlay
                muted
                loop
              />
            )
          ) : (
            <div className="story-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Drop media here</span>
            </div>
          )}
        </div>

        {/* Caption overlay at bottom */}
        {primaryText && (
          <div className="story-caption">
            {primaryText.slice(0, 120)}
          </div>
        )}

        {/* CTA swipe-up bar */}
        <div className="story-cta-bar">
          <div
            className="story-cta-btn"
            style={{ background: ctaBgColor, color: ctaTextColor }}
          >
            {cta}
          </div>
        </div>
      </div>
    </div>
  );
}
