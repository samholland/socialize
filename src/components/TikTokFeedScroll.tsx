"use client";

import type { PreviewMedia } from "./PreviewCanvas";

export type TikTokFeedScrollProps = {
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  clientName: string;
  clientAvatarUrl?: string;
  media: PreviewMedia;
  interactive?: boolean;
};

export function TikTokFeedScroll({
  primaryText,
  cta,
  ctaBgColor,
  ctaTextColor,
  clientName,
  clientAvatarUrl,
  media,
  interactive = true,
}: TikTokFeedScrollProps) {
  const WRAPPER_W = 300;
  const WRAPPER_H = Math.round(300 * (2969 / 1842)); // ≈ 484

  const hasMedia = media.kind === "image" || media.kind === "video";
  const handle = "@" + clientName.toLowerCase().replace(/\s+/g, "");

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

      {/* Screen */}
      <div
        className="feed-screen tt-screen"
        style={interactive ? undefined : { pointerEvents: "none" }}
      >
        {/* Full-bleed video/media background */}
        <div className="tt-media">
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
                playsInline autoPlay muted loop
              />
            )
          ) : (
            <div className="tt-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          )}
        </div>

        {/* Top bar — scrollable tab strip */}
        <div className="tt-top-bar">
          <div className="tt-tabs-strip">
            <span className="tt-live-badge">LIVE</span>
            <span className="tt-tab">Explore</span>
            <span className="tt-tab">Local</span>
            <span className="tt-tab">Following</span>
            <span className="tt-tab">Shop</span>
            <span className="tt-tab tt-active">For You</span>
          </div>
          <span className="tt-search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
        </div>

        {/* Sponsored label */}
        <div className="tt-sponsored-label">Sponsored</div>

        {/* Right action column */}
        <div className="tt-actions">
          <div className="tt-action-avatar-wrap">
            <div className="tt-action-avatar">
              {clientAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clientAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} draggable={false} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "#555", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                  {clientName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="tt-follow-plus">+</div>
          </div>

          {/* Heart */}
          <div className="tt-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span>5.5K</span>
          </div>

          {/* Comment — TikTok style: filled circle with dots */}
          <div className="tt-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="white"/>
              <circle cx="8" cy="12" r="1.5" fill="black"/>
              <circle cx="12" cy="12" r="1.5" fill="black"/>
              <circle cx="16" cy="12" r="1.5" fill="black"/>
            </svg>
            <span>184</span>
          </div>

          {/* Share/bookmark — share network icon */}
          <div className="tt-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span>412</span>
          </div>

          {/* Save/Bookmark */}
          <div className="tt-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <span>633</span>
          </div>

          <div className="tt-record-disc">
            <div className="tt-record-inner" />
          </div>
        </div>

        {/* Bottom-left info */}
        <div className="tt-info">
          <div className="tt-handle">{handle}</div>
          {primaryText && (
            <div className="tt-caption">{primaryText.slice(0, 80)}</div>
          )}
          <div className="tt-audio-bar">
            <span className="tt-music-note">♪</span>
            <span className="tt-audio-text">Original sound – {clientName}</span>
          </div>
        </div>

        {/* CTA button */}
        <div className="tt-cta-wrap">
          <div
            className="tt-cta-btn"
            style={{ background: ctaBgColor, color: ctaTextColor }}
          >
            {cta}
          </div>
        </div>

        {/* Bottom nav — Home / Friends / + / Inbox / Profile */}
        <div className="tt-bottom-nav">
          <button className="tt-nav-btn tt-nav-active">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <span>Home</span>
          </button>
          {/* Friends (two-person icon) */}
          <button className="tt-nav-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Friends</span>
          </button>
          <button className="tt-nav-btn">
            <div className="tt-plus-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="3" stroke="white" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </div>
          </button>
          <button className="tt-nav-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Inbox</span>
          </button>
          <button className="tt-nav-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
}
