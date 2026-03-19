"use client";

import type { PreviewMedia } from "./PreviewCanvas";

export type ReelsFeedScrollProps = {
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  clientName: string;
  clientAvatarUrl?: string;
  media: PreviewMedia;
};

export function ReelsFeedScroll({
  primaryText,
  cta,
  ctaBgColor,
  ctaTextColor,
  clientName,
  clientAvatarUrl,
  media,
}: ReelsFeedScrollProps) {
  const WRAPPER_W = 300;
  const WRAPPER_H = Math.round(300 * (2969 / 1842)); // ≈ 484

  const hasMedia = media.kind === "image" || media.kind === "video";
  const handle = "@" + clientName.toLowerCase().replace(/\s+/g, "");

  const avatarContent = clientAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={clientAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} draggable={false} />
  ) : (
    <div style={{ width: "100%", height: "100%", background: "#555", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>
      {clientName.slice(0, 1).toUpperCase()}
    </div>
  );

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
      <div className="feed-screen reels-screen">
        {/* Full-bleed media background */}
        <div className="reels-media">
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
            <div className="reels-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          )}
        </div>

        {/* Top bar: + | Reels ▾ | filter icon */}
        <div className="reels-top-bar">
          {/* + new story */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>

          {/* Reels ▾ */}
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span className="reels-title">Reels</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {/* Filter / tune icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            <circle cx="8" cy="6" r="2" fill="white" stroke="white"/><circle cx="16" cy="12" r="2" fill="white" stroke="white"/><circle cx="10" cy="18" r="2" fill="white" stroke="white"/>
          </svg>
        </div>

        {/* Sponsored label */}
        <div className="reels-sponsored-label">Sponsored</div>

        {/* Right action column: heart, comment, send, avatar (bottom) */}
        <div className="reels-actions">
          {/* Heart */}
          <div className="reels-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span>4</span>
          </div>

          {/* Comment — circle with dots */}
          <div className="reels-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="white"/>
              <circle cx="8" cy="12" r="1.5" fill="black"/>
              <circle cx="12" cy="12" r="1.5" fill="black"/>
              <circle cx="16" cy="12" r="1.5" fill="black"/>
            </svg>
            <span>1</span>
          </div>

          {/* Send / paper-plane */}
          <div className="reels-action-item">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>43</span>
          </div>

          {/* Avatar (at bottom of column) with IG gradient ring */}
          <div className="reels-action-avatar-sm">
            {avatarContent}
          </div>
        </div>

        {/* Bottom-left info: avatar + handle + Follow, caption, "Ad", audio */}
        <div className="reels-info">
          <div className="reels-info-header">
            <div className="reels-info-avatar">
              {avatarContent}
            </div>
            <span className="reels-handle">{handle}</span>
            <span className="reels-follow-btn">Follow</span>
          </div>
          {primaryText && (
            <div className="reels-caption">{primaryText.slice(0, 90)}</div>
          )}
          <div className="reels-ad-label">Ad</div>
          <div className="reels-audio-bar">
            <span className="reels-music-note">♪</span>
            <span className="reels-audio-text">Original audio – {clientName}</span>
          </div>
        </div>

        {/* CTA bar — wide, above bottom nav */}
        <div className="reels-cta-wrap">
          <div
            className="reels-cta-btn"
            style={{ background: ctaBgColor, color: ctaTextColor }}
          >
            {cta}
          </div>
          <span className="reels-cta-chevron">›</span>
        </div>

        {/* IG Bottom nav: Home, Reels(active), Send, Search, Profile */}
        <div className="reels-bottom-nav">
          {/* Home */}
          <button className="reels-nav-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          {/* Reels (active) */}
          <button className="reels-nav-btn reels-nav-active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11zM10 9v6l5-3-5-3z"/></svg>
          </button>
          {/* Send / DM */}
          <button className="reels-nav-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
          {/* Search */}
          <button className="reels-nav-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          {/* Profile */}
          <button className="reels-nav-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
