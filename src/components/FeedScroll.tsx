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

function IgIcon({ src, size = 20, muted = false }: { src: string; size?: number; muted?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ opacity: muted ? 0.45 : 1, display: "block", objectFit: "contain" }}
      draggable={false}
    />
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
        <IgIcon src="/images/ig_heart.svg" size={20} />
        <IgIcon src="/images/ig_comment.svg" size={20} />
        <IgIcon src="/images/ig_send.svg" size={20} />
        <div style={{ flex: 1 }} />
        <IgIcon src="/images/ig_bookmark.svg" size={20} />
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

  // Scroll so the ad is visible on mount / media change
  useEffect(() => {
    const screen = screenRef.current;
    const ad = adRef.current;
    if (!screen || !ad) return;
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
      <div
        className="feed-screen"
        ref={screenRef}
      >
        {/* IG top bar */}
        <div className="feed-top-bar">
          <span className="feed-top-logo">Instagram</span>
          <div style={{ display: "flex", gap: 10 }}>
            <IgIcon src="/images/ig_send.svg" size={20} />
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
            <IgIcon src="/images/ig_heart.svg" size={20} />
            <IgIcon src="/images/ig_comment.svg" size={20} />
            <IgIcon src="/images/ig_send.svg" size={20} />
            <div style={{ flex: 1 }} />
            <IgIcon src="/images/ig_bookmark.svg" size={20} />
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
          <IgIcon src="/images/ig_home.svg" size={22} />
          <IgIcon src="/images/ig_search.svg" size={22} muted />
          <IgIcon src="/images/ig_newpost.svg" size={22} muted />
          <IgIcon src="/images/ig_reels.svg" size={22} muted />
          <IgIcon src="/images/ig_pfp_blank.svg" size={22} muted />
        </div>
      </div>
    </div>
  );
}
