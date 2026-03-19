"use client";

import type { PreviewMedia } from "./PreviewCanvas";

export type FacebookFeedScrollProps = {
  primaryText: string;
  cta: string;
  ctaBgColor: string;
  ctaTextColor: string;
  mediaAspect: "1:1" | "3:4" | "9:16";
  clientName: string;
  clientAvatarUrl?: string;
  media: PreviewMedia;
};

const FAKE_FB_POSTS = [
  {
    name: "Emily Carter",
    avatarColor: "#6c9bcf",
    time: "2 hrs ago",
    text: "Had the most amazing weekend hiking at the national park! The views were absolutely breathtaking. 🌄",
    likes: "147",
    comments: "23",
  },
  {
    name: "Marcus Webb",
    avatarColor: "#e8965a",
    time: "4 hrs ago",
    text: "Just got my new camera setup. Time to start creating! 📸",
    likes: "89",
    comments: "11",
  },
];

function FbFakePoster({ post }: { post: typeof FAKE_FB_POSTS[0] }) {
  return (
    <div className="fb-post">
      <div className="fb-post-header">
        <div className="fb-avatar" style={{ background: post.avatarColor }}>
          {post.name.slice(0, 1)}
        </div>
        <div className="fb-post-meta">
          <div className="fb-post-name">{post.name}</div>
          <div className="fb-post-time">{post.time} · 🌐</div>
        </div>
        <span className="fb-post-more">⋯</span>
      </div>
      <div className="fb-post-text">{post.text}</div>
      <div
        className="fb-post-image"
        style={{ background: "linear-gradient(135deg, #c8d8e8, #a0b8cc)", aspectRatio: "3/2" }}
      />
      <div className="fb-post-counts">
        <span style={{ fontSize: 9 }}>👍 {post.likes} · 💬 {post.comments}</span>
      </div>
      <div className="fb-post-actions">
        <button className="fb-action-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          Like
        </button>
        <button className="fb-action-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Comment
        </button>
        <button className="fb-action-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
    </div>
  );
}

export function FacebookFeedScroll({
  primaryText,
  cta,
  ctaBgColor,
  ctaTextColor,
  mediaAspect,
  clientName,
  clientAvatarUrl,
  media,
}: FacebookFeedScrollProps) {
  const WRAPPER_W = 300;
  const WRAPPER_H = Math.round(300 * (2969 / 1842)); // ≈ 484

  const hasMedia = media.kind === "image" || media.kind === "video";
  const adAspect = mediaAspect === "3:4" ? "3/4" : "1/1";

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
      <div className="feed-screen fb-screen">
        {/* Facebook top bar — white bg, blue "facebook" wordmark, SVG icons */}
        <div className="fb-top-bar">
          {/* Hamburger menu */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>

          <div className="fb-logo">facebook</div>

          <div className="fb-nav-icons">
            {/* Create / plus */}
            <div className="fb-nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            {/* Search */}
            <div className="fb-nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            {/* Messenger bubble */}
            <div className="fb-nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
          </div>
        </div>

        {/* Tab bar: Home (active), Reels, Friends, Groups, Notifications */}
        <div className="fb-tab-bar">
          <div className="fb-tab fb-tab-active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877f2" stroke="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <span>Home</span>
          </div>
          <div className="fb-tab">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#65676b" stroke="none"><path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11zM10 9v6l5-3-5-3z"/></svg>
            <span>Reels</span>
          </div>
          <div className="fb-tab">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>Friends</span>
          </div>
          <div className="fb-tab">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span>Groups</span>
          </div>
          <div className="fb-tab">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span>Notifs</span>
          </div>
        </div>

        {/* Scrollable feed */}
        <div className="fb-feed-scroll">
          <FbFakePoster post={FAKE_FB_POSTS[0]} />

          {/* The Ad */}
          <div className="fb-post fb-ad-post">
            <div className="fb-post-header">
              <div
                className="fb-avatar"
                style={{
                  background: "#555",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {clientAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clientAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
                ) : (
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>
                    {clientName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="fb-post-meta">
                <div className="fb-post-name" style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  {clientName}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/fb_verified.svg" width="12" height="12" alt="verified" draggable={false} />
                </div>
                <div className="fb-post-time">Sponsored · 🌐</div>
              </div>
              <span className="fb-post-more">⋯</span>
            </div>

            {primaryText && (
              <div className="fb-post-text">{primaryText.slice(0, 100)}</div>
            )}

            {/* Ad media */}
            <div className="fb-ad-media" style={{ aspectRatio: adAspect }}>
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
                <div className="fb-ad-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
            </div>

            {/* CTA bar */}
            <div className="fb-cta-bar">
              <div className="fb-cta-text">
                <div className="fb-cta-domain">{clientName.toLowerCase().replace(/\s/g, "")}.com</div>
                <div className="fb-cta-headline">{primaryText.slice(0, 40) || clientName}</div>
              </div>
              <div
                className="fb-cta-btn"
                style={{ background: ctaBgColor, color: ctaTextColor }}
              >
                {cta}
              </div>
            </div>

            {/* Reactions */}
            <div className="fb-post-counts">
              <span style={{ fontSize: 9 }}>👍 2.1K · 💬 48 comments</span>
            </div>
            <div className="fb-post-actions">
              <button className="fb-action-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                Like
              </button>
              <button className="fb-action-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Comment
              </button>
              <button className="fb-action-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
              </button>
            </div>
          </div>

          <FbFakePoster post={FAKE_FB_POSTS[1]} />
        </div>

        {/* Facebook bottom nav — SVG icons */}
        <div className="fb-bottom-nav">
          <button className="fb-bottom-btn fb-bottom-active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877f2" stroke="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          </button>
          <button className="fb-bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#65676b" stroke="none"><path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11zM10 9v6l5-3-5-3z"/></svg>
          </button>
          <button className="fb-bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
          <button className="fb-bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <button className="fb-bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
