"use client";

import { useEffect, useRef } from "react";
import type { PreviewMedia } from "./PreviewCanvas";

export type FeedScrollProps = {
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  platform: string;
  mediaAspect: "1:1" | "3:4" | "9:16";
  clientName: string;
  clientAvatarUrl?: string;
  media: PreviewMedia;
};

// Fake posts for the feed background
const FAKE_POSTS: {
  username: string;
  avatarColor: string;
  likes: string;
  caption: string;
  gradFrom: string;
  gradTo: string;
  aspectRatio: string;
}[] = [
  {
    username: "studio.lens",
    avatarColor: "#c4a882",
    likes: "4,821",
    caption: "Golden hour never disappoints. 🌅 #photography #goldenhour",
    gradFrom: "#f0c27f",
    gradTo: "#c97c3a",
    aspectRatio: "1/1",
  },
  {
    username: "minimal.arch",
    avatarColor: "#8baec4",
    likes: "2,394",
    caption: "Lines and light. ✨ #architecture #minimal",
    gradFrom: "#c5d8e8",
    gradTo: "#7ba8c0",
    aspectRatio: "3/4",
  },
  {
    username: "nomad.routes",
    avatarColor: "#a8c4a0",
    likes: "8,102",
    caption: "New city every week. 🗺️ #travel #explore",
    gradFrom: "#88c988",
    gradTo: "#4a7a49",
    aspectRatio: "1/1",
  },
  {
    username: "still.frames",
    avatarColor: "#c4aab8",
    likes: "1,236",
    caption: "Details make the difference. 🎞 #film #analog",
    gradFrom: "#dbbfd4",
    gradTo: "#c490b8",
    aspectRatio: "1/1",
  },
];

function HeartSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CommentSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BookmarkSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function HomeSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#262626" stroke="none">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

function SearchSvgNav() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e8e" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ReelsSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e8e" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
      <line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  );
}

function MoreSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#8e8e8e">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function FakePost({ post }: { post: typeof FAKE_POSTS[0] }) {
  return (
    <div className="feed-post">
      <div className="feed-post-header">
        <div
          className="feed-post-avatar"
          style={{ background: post.avatarColor }}
        />
        <span className="feed-post-username">{post.username}</span>
        <span className="feed-post-more"><MoreSvg /></span>
      </div>
      <div
        className="feed-post-image"
        style={{
          background: `linear-gradient(135deg, ${post.gradFrom}, ${post.gradTo})`,
          aspectRatio: post.aspectRatio,
        }}
      />
      <div className="feed-post-actions">
        <HeartSvg /><CommentSvg /><SendSvg />
        <div style={{ flex: 1 }} />
        <BookmarkSvg />
      </div>
      <div className="feed-post-likes">{post.likes} likes</div>
      <div className="feed-post-caption">
        <strong>{post.username}</strong> {post.caption}
      </div>
    </div>
  );
}

export function FeedScroll({
  primaryText,
  cta,
  ctaBgColor,
  ctaTextColor,
  platform,
  mediaAspect,
  clientName,
  clientAvatarUrl,
  media,
}: FeedScrollProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLDivElement>(null);

  const isStory = platform === "Instagram Story" || platform === "TikTok";

  // Scroll so the ad is visible (2 fake posts above it)
  useEffect(() => {
    const screen = screenRef.current;
    const ad = adRef.current;
    if (!screen || !ad) return;
    // Small delay to allow layout
    const id = setTimeout(() => {
      const adTop = ad.offsetTop;
      const screenH = screen.clientHeight;
      screen.scrollTop = Math.max(0, adTop - screenH * 0.2);
    }, 80);
    return () => clearTimeout(id);
  }, [platform, mediaAspect, media]);

  const adAspect = isStory ? "9/16" : mediaAspect === "3:4" ? "3/4" : "1/1";

  const trimmedName = (clientName || "Brand").slice(0, 20);

  return (
    <div
      className="feed-wrapper"
      style={{
        width: 300,
        height: Math.round(300 * (2969 / 1842)),
      }}
    >
      {/* iPhone frame */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/iphone_frame.png"
        className="feed-frame-img"
        alt=""
        draggable={false}
      />

      {/* Scrollable screen */}
      <div className="feed-screen" ref={screenRef}>
        {/* IG top bar */}
        <div className="feed-top-bar">
          <span className="feed-top-logo">Instagram</span>
          <div style={{ display: "flex", gap: 10, color: "#262626" }}>
            <SendSvg />
          </div>
        </div>

        {/* Fake posts above */}
        <FakePost post={FAKE_POSTS[0]} />
        <FakePost post={FAKE_POSTS[1]} />

        {/* THE AD */}
        <div
          ref={adRef}
          className="feed-post"
          style={{ background: "#fff" }}
        >
          {/* Ad header */}
          <div className="feed-ad-header">
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "#e0e0e0",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {clientAvatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clientAvatarUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </div>
            <div className="feed-ad-name-block">
              <span className="feed-ad-username">
                {trimmedName}
                <span className="feed-ad-verified" />
              </span>
              <span className="feed-ad-sponsored">Sponsored</span>
            </div>
            <MoreSvg />
          </div>

          {/* Media */}
          <div style={{ position: "relative", aspectRatio: adAspect, background: "#e8e8e8", overflow: "hidden" }}>
            {media.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            )}
            {media.kind === "video" && (
              <video
                src={media.url}
                autoPlay
                muted
                loop
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            )}
            {media.kind === "none" && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg, #1f2734, #3b4558)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 10,
                }}
              >
                Drop media to preview
              </div>
            )}
          </div>

          {/* CTA bar */}
          <div
            className="feed-ad-cta"
            style={{ background: ctaBgColor || "#4f94aa", color: ctaTextColor || "#fff" }}
          >
            <span>{cta || "Learn More"}</span>
            <span>›</span>
          </div>

          {/* Actions */}
          <div className="feed-post-actions">
            <HeartSvg /><CommentSvg /><SendSvg />
            <div style={{ flex: 1 }} />
            <BookmarkSvg />
          </div>

          {/* Caption */}
          {primaryText && (
            <div className="feed-ad-caption">
              <strong>{trimmedName}</strong>{" "}
              {primaryText.length > 90
                ? primaryText.slice(0, 87) + "…"
                : primaryText}
            </div>
          )}
        </div>

        {/* Fake posts below */}
        <FakePost post={FAKE_POSTS[2]} />
        <FakePost post={FAKE_POSTS[3]} />

        {/* Bottom nav */}
        <div className="feed-bottom-nav">
          <HomeSvg />
          <SearchSvgNav />
          <div
            style={{
              width: 20,
              height: 20,
              border: "1.5px solid #8e8e8e",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 10, height: 10, background: "#8e8e8e", borderRadius: 2 }} />
          </div>
          <ReelsSvg />
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#c4c4c4",
              border: "1.5px solid #8e8e8e",
            }}
          />
        </div>
      </div>
    </div>
  );
}
