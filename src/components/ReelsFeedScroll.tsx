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
  const WRAPPER_W = 340;
  const WRAPPER_H = Math.round(WRAPPER_W * (2969 / 1842));

  const hasMedia = media.kind === "image" || media.kind === "video";
  const handle = "@" + clientName.toLowerCase().replace(/\s+/g, "");

  const avatarInner = clientAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={clientAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} draggable={false} />
  ) : (
    <div style={{ width: "100%", height: "100%", background: "#555", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>
      {clientName.slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="feed-wrapper" style={{ width: WRAPPER_W, height: WRAPPER_H, position: "relative" }}>
      {/* iPhone frame overlay */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/iphone_frame.png" alt="" className="feed-frame-img" draggable={false} />

      {/* Screen */}
      <div className="feed-screen reels-screen">

        {/* Full-bleed media */}
        <div className="reels-media">
          {hasMedia ? (
            media.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} draggable={false} />
            ) : (
              <video src={media.url} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} playsInline autoPlay muted loop />
            )
          ) : (
            <div className="reels-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          )}
        </div>

        {/* ── Top bar: + | Reels  Friends [avatars] ── */}
        <div className="reels-top-bar">
          {/* Plus */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>

          {/* Reels + Friends */}
          <div className="reels-top-center">
            <span className="reels-title-active">Reels</span>
            <span className="reels-title-inactive">Friends</span>
            {/* Overlapping fake friend avatars */}
            <div className="reels-friend-avatars">
              <div className="reels-friend-av" style={{ background: "#a78bfa", zIndex: 2 }}>E</div>
              <div className="reels-friend-av" style={{ background: "#60a5fa", marginLeft: -6, zIndex: 1 }}>J</div>
            </div>
          </div>

          {/* Spacer to balance the layout */}
          <div style={{ width: 16 }} />
        </div>

        {/* ── Right action column ── */}
        <div className="reels-actions">
          {/* Heart */}
          <div className="reels-action-item">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span>29.9K</span>
          </div>

          {/* Comment — IG-style circle bubble with bottom-left tail */}
          <div className="reels-action-item">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .99 4.28L2 22l5.72-.99A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
            </svg>
            <span>65</span>
          </div>

          {/* Repost / share — two arrows */}
          <div className="reels-action-item">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <polyline points="23 20 23 14 17 14"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            <span>1,064</span>
          </div>

          {/* Send / DM — paper plane */}
          <div className="reels-action-item">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            <span>2,497</span>
          </div>

          {/* Ellipsis */}
          <div className="reels-action-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
            </svg>
          </div>

          {/* Small video thumbnail */}
          <div className="reels-thumb-preview">
            {avatarInner}
          </div>
        </div>

        {/* ── Bottom-left info overlay ── */}
        <div className="reels-info">
          {/* 1. Bold caption */}
          {primaryText && (
            <div className="reels-caption-bold">{primaryText.slice(0, 100)}</div>
          )}

          {/* 2. CTA — above username */}
          {cta && (
            <div className="reels-cta-row" style={{ background: ctaBgColor, color: ctaTextColor }}>
              <span className="reels-cta-text">{cta}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          )}

          {/* 3. Avatar + handle + verified + Follow */}
          <div className="reels-info-row">
            <div className="reels-info-avatar">{avatarInner}</div>
            <span className="reels-handle">{handle}</span>
            {/* Verified checkmark */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#3897f0">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
            </svg>
            <div className="reels-follow-btn">Follow</div>
          </div>

          {/* 4. Secondary description */}
          {primaryText && (
            <div className="reels-caption-secondary">{primaryText.slice(0, 60)}{primaryText.length > 60 ? " ..." : ""}</div>
          )}

          {/* 5. Sponsored — small, bottom */}
          <div className="reels-sponsored-small">Sponsored</div>
        </div>

        {/* ── Bottom nav ── */}
        <div className="reels-bottom-nav">
          {/* Home */}
          <button className="reels-nav-btn">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>
          {/* Reels (active) — play square */}
          <button className="reels-nav-btn reels-nav-active">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="3" ry="3"/>
              <polygon points="10 8 16 12 10 16 10 8" fill="white" stroke="none"/>
            </svg>
          </button>
          {/* Send / DM */}
          <button className="reels-nav-btn">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
          {/* Search */}
          <button className="reels-nav-btn">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          {/* Profile */}
          <button className="reels-nav-btn">
            <div className="reels-nav-profile">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
