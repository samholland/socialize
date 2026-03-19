"use client";

import { useState } from "react";
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

// Fake stories that sandwich the client's ad story
const FAKE_STORIES = [
  { name: "emily_c",   gradFrom: "#f0c27f", gradTo: "#e07b3a", caption: "Morning vibes ☀️" },
  { name: "jack.v",    gradFrom: "#85c1e9", gradTo: "#2e86c1", caption: "New drop just landed 🔥" },
  { name: "urbanshot", gradFrom: "#82e0aa", gradTo: "#1e8449", caption: "Out and about 🌿" },
];

// Client ad story sits at index 1 (between fake[0] and fake[1])
const AD_INDEX = 1;
const TOTAL = FAKE_STORIES.length + 1; // 4 stories total

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

  const [storyIdx, setStoryIdx] = useState(AD_INDEX);

  const prev = () => setStoryIdx((i) => Math.max(0, i - 1));
  const next = () => setStoryIdx((i) => Math.min(TOTAL - 1, i + 1));

  // Which fake story to show (offset by AD_INDEX insertion)
  const fakeIdx = storyIdx < AD_INDEX ? storyIdx : storyIdx - 1;
  const fake = FAKE_STORIES[fakeIdx];
  const isAd = storyIdx === AD_INDEX;

  // Current story owner name/initial for header
  const displayName = isAd ? clientName : fake.name;
  const displayInitial = displayName.slice(0, 1).toUpperCase();

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
      <div className="feed-screen story-screen">

        {/* ── Background media / colour ── */}
        {isAd ? (
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
                  playsInline autoPlay muted loop
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
        ) : (
          <div
            className="story-media"
            style={{ background: `linear-gradient(160deg, ${fake.gradFrom}, ${fake.gradTo})` }}
          >
            <div style={{ position: "absolute", bottom: 80, left: 0, right: 0, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{fake.caption}</span>
            </div>
          </div>
        )}

        {/* ── Overlay chrome (progress + header + tap zones) ── */}
        <div className="story-chrome">
          {/* Progress bars */}
          <div className="story-progress-bars">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <div
                key={i}
                className={`story-bar ${
                  i < storyIdx ? "story-bar-done" :
                  i === storyIdx ? "story-bar-active" :
                  "story-bar-empty"
                }`}
              />
            ))}
          </div>

          {/* Story header */}
          <div className="story-header">
            <div className="story-avatar-wrap">
              {isAd && clientAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clientAvatarUrl} alt="" className="story-avatar-img" draggable={false} />
              ) : (
                <div
                  className="story-avatar-img"
                  style={{ background: isAd ? "#555" : fake.gradTo, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}
                >
                  {displayInitial}
                </div>
              )}
            </div>
            <div className="story-header-info">
              <span className="story-username">{displayName}</span>
              {isAd && <span className="story-sponsored">Sponsored</span>}
            </div>
            <div style={{ flex: 1 }} />
            <span className="story-header-icon">✕</span>
            <span className="story-header-icon" style={{ marginLeft: 8 }}>⋯</span>
          </div>

          {/* Left / right tap zones */}
          <div className="story-tap-zones">
            <div className="story-tap-zone story-tap-left"  onClick={prev} />
            <div className="story-tap-zone story-tap-right" onClick={next} />
          </div>
        </div>

        {/* ── Ad-only overlays ── */}
        {isAd && primaryText && (
          <div className="story-caption">{primaryText.slice(0, 120)}</div>
        )}
        {isAd && (
          <div className="story-cta-pill" style={{ background: ctaBgColor, color: ctaTextColor }}>
            {/* Chain-link icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span className="story-cta-pill-text">{cta || "Learn More"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
