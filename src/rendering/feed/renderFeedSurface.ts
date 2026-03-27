import { FEED_ACTION_ICON_PATHS, FEED_NAV_ICON_PATHS, FONT_STACK } from "@/components/preview-canvas/constants";
import {
  drawTintedImage,
  fillRoundedRect,
  fitText,
} from "@/rendering/core/primitives";
import {
  clipScreen,
  drawAvatarCircle,
  drawFeedMedia,
  drawFeedStatusBar,
  drawMoreIcon,
  drawVerifiedBadge,
  endClip,
  mediaHeightForAspect,
} from "./shared";
import type { DrawFeedSurfaceArgs } from "./types";

function drawCaptionBlock(
  ctx: CanvasRenderingContext2D,
  {
    x,
    y,
    maxWidth,
    maxLines,
    draw = true,
    lineHeight,
    username,
    body,
    scale,
  }: {
    x: number;
    y: number;
    maxWidth: number;
    maxLines?: number;
    draw?: boolean;
    lineHeight: number;
    username: string;
    body: string;
    scale: number;
  }
): number {
  const resolvedMaxLines = Number.isFinite(maxLines) ? Math.max(1, Math.floor(maxLines ?? 1)) : Number.POSITIVE_INFINITY;
  const name = fitText(username || "brand", 22);
  const text = body.trim();
  if (!text) {
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
    ctx.fillText(name, x, y);
    return 1;
  }

  const lines: Array<{ includeName: boolean; text: string }> = [];
  let isFirstLine = true;
  let truncated = false;

  const measureLine = (lineText: string, includeName: boolean) => {
    if (!includeName) {
      ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
      return ctx.measureText(lineText).width;
    }
    ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
    const nameWidth = ctx.measureText(name).width;
    ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
    return nameWidth + ctx.measureText(` ${lineText}`).width;
  };

  const paragraphs = text.split(/\r?\n/);
  for (let p = 0; p < paragraphs.length; p += 1) {
    const paragraphWords = paragraphs[p].trim().split(/\s+/).filter(Boolean);

    if (paragraphWords.length === 0) {
      if (lines.length < resolvedMaxLines) {
        lines.push({ includeName: isFirstLine, text: "" });
        isFirstLine = false;
      } else {
        truncated = true;
      }
      continue;
    }

    let wordIndex = 0;
    while (lines.length < resolvedMaxLines && wordIndex < paragraphWords.length) {
      let candidate = "";
      let consumed = 0;

      for (let i = wordIndex; i < paragraphWords.length; i += 1) {
        const next = candidate ? `${candidate} ${paragraphWords[i]}` : paragraphWords[i];
        if (measureLine(next, isFirstLine) <= maxWidth || candidate.length === 0) {
          candidate = next;
          consumed += 1;
          continue;
        }
        break;
      }

      lines.push({ includeName: isFirstLine, text: candidate });
      wordIndex += consumed;
      isFirstLine = false;
    }

    if (wordIndex < paragraphWords.length) {
      truncated = true;
      break;
    }

    if (lines.length >= resolvedMaxLines && p < paragraphs.length - 1) {
      truncated = true;
      break;
    }
  }

  if (Number.isFinite(resolvedMaxLines) && truncated && lines.length > 0) {
    const lastIndex = lines.length - 1;
    let trimmed = lines[lastIndex].text;
    while (trimmed.length > 0) {
      const candidate = `${trimmed}...`;
      if (measureLine(candidate, lines[lastIndex].includeName) <= maxWidth) {
        lines[lastIndex].text = candidate;
        break;
      }
      trimmed = trimmed.slice(0, -1).trimEnd();
    }
    if (!lines[lastIndex].text.endsWith("...")) lines[lastIndex].text = "...";
  }

  if (draw) {
    lines.forEach((line, index) => {
      const lineY = y + index * lineHeight;
      if (line.includeName) {
        ctx.fillStyle = "#1f1f1f";
        ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
        ctx.fillText(name, x, lineY);
        const nameWidth = ctx.measureText(name).width;
        ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
        ctx.fillText(` ${line.text}`, x + nameWidth, lineY);
        return;
      }

      ctx.fillStyle = "#1f1f1f";
      ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
      ctx.fillText(line.text, x, lineY);
    });
  }

  return Math.max(1, lines.length);
}

function facebookDomainLabel(rawUrl: string, fallbackName: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return `${fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand"}.com`;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./i, "");
    if (host) return host;
  } catch {
    // Fall through to permissive parsing.
  }

  const simplified = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();
  return simplified || `${fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand"}.com`;
}

function drawUntruncatedWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  preserveLineBreaks = false
): number {
  const wrapWords = (content: string): string[] => {
    const words = content.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let current = words[0];

    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
    return lines;
  };

  const lines = preserveLineBreaks
    ? text.split(/\r?\n/).flatMap((paragraph) => {
        const wrapped = wrapWords(paragraph);
        return wrapped.length > 0 ? wrapped : [""];
      })
    : wrapWords(text);

  if (lines.length === 0) return 0;

  lines.forEach((line, index) => {
    if (line) {
      ctx.fillText(line, x, y + index * lineHeight);
    }
  });

  return lines.length;
}

function wrappedLineCount(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let lines = 1;
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines += 1;
      current = words[i];
    }
  }
  return lines;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  const lo = Math.floor(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${value}`;
}

function instagramEngagementCounts(
  preset: "low" | "medium" | "high",
  seed: number
): { likes: string; comments: string; sends: string } {
  const rng = mulberry32(seed || 1);

  const ranges =
    preset === "high"
      ? {
          likes: [4_000, 65_000],
          comments: [120, 4_200],
          sends: [40, 2_600],
        }
      : preset === "low"
        ? {
            likes: [35, 420],
            comments: [2, 42],
            sends: [1, 26],
          }
        : {
            likes: [500, 8_400],
            comments: [20, 520],
            sends: [8, 280],
          };

  return {
    likes: formatCompactCount(randomInt(rng, ranges.likes[0], ranges.likes[1])),
    comments: formatCompactCount(randomInt(rng, ranges.comments[0], ranges.comments[1])),
    sends: formatCompactCount(randomInt(rng, ranges.sends[0], ranges.sends[1])),
  };
}

async function drawInstagramFeedSurface(args: DrawFeedSurfaceArgs) {
  const {
    ctx,
    layout,
    mediaAspect,
    primaryText,
    cta,
    ctaBgColor,
    ctaTextColor,
    clientName,
    clientVerified,
    clientAvatarUrl,
    engagementPreset = "medium",
    engagementSeed = 1,
    loadImageFromUrl,
  } = args;

  const [heartIcon, commentIcon, sendIcon, bookmarkIcon, navHome, navReels, navSend, navSearch, navProfile] =
    await Promise.all([
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[0]),
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[1]),
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[2]),
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[3]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[0]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[1]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[2]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[3]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[4]),
    ]);

  const s = layout.scale;
  const screen = layout.screen;
  const navH = 80 * s;

  clipScreen(ctx, layout);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);

  drawFeedStatusBar(ctx, layout);

  const toolbarY = screen.y - 28 * s;
  const toolbarH = 30 * s;

  let y = toolbarY + toolbarH;

  y += 50 * s;
  ctx.fillStyle = "#efefef";
  ctx.fillRect(screen.x, y, screen.w, 1 * s);

  const adHeaderY = y + 0 * s;
  const adHeaderH = 52 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(screen.x, adHeaderY, screen.w, adHeaderH);

  await drawAvatarCircle(
    ctx,
    screen.x + 24 * s,
    adHeaderY + 4 + adHeaderH / 2,
    15.5 * s,
    clientName,
    clientAvatarUrl,
    loadImageFromUrl
  );

  const safeName = fitText(clientName || "brand", 18);
  ctx.fillStyle = "#1f1f1f";
  ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
  const nameX = screen.x + 47 * s;
  const nameY = adHeaderY + 27 * s;
  ctx.fillText(safeName, nameX, nameY);

  if (clientVerified) {
    const badgeSize = 10 * s;
    const nameW = ctx.measureText(safeName).width;
    drawVerifiedBadge(ctx, nameX + nameW + 4 * s, nameY - 9 * s, badgeSize);
  }

  ctx.fillStyle = "#1f1f1f";
  ctx.font = `500 ${11 * s}px ${FONT_STACK}`;
  ctx.fillText("Ad", screen.x + 47 * s, adHeaderY + 42 * s);

  drawMoreIcon(ctx, screen.x + screen.w - 25 * s, adHeaderY + 29 * s, 2.1 * s, "#9a9a9a");

  const mediaY = adHeaderY + adHeaderH;
  const ctaH = 36 * s;
  const actionsH = 40 * s;
  const captionLineHeight = 15 * s;
  const captionTopPadding = 8 * s;
  const captionBottomPadding = 10 * s;
  const captionBody = primaryText || "Write some post copy.";
  ctx.font = `500 ${12.5 * s}px ${FONT_STACK}`;
  const captionLines = drawCaptionBlock(ctx, {
    x: 0,
    y: 0,
    maxWidth: screen.w - 28 * s,
    draw: false,
    lineHeight: captionLineHeight,
    username: safeName,
    body: captionBody,
    scale: s,
  });
  const captionH = captionTopPadding + captionBottomPadding + captionLineHeight * captionLines;
  const mediaTargetH = mediaHeightForAspect(screen.w, mediaAspect);
  const mediaH = mediaTargetH;
  const mediaRect = { x: screen.x, y: mediaY, w: screen.w, h: mediaH };

  await drawFeedMedia(args, mediaRect);

  const ctaY = mediaRect.y + mediaRect.h;
  ctx.fillStyle = ctaBgColor;
  ctx.fillRect(screen.x, ctaY - 13, screen.w, ctaH);
  ctx.fillStyle = ctaTextColor;
  ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
  ctx.fillText(fitText(cta || "Learn More", 18), screen.x + 16 * s, ctaY + 14 * s);
  ctx.fillText("›", screen.x + screen.w - 24 * s, ctaY + 13 * s);

  const actionsY = ctaY + ctaH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, actionsY, screen.w, actionsH);

  if (bookmarkIcon) {
    drawTintedImage(
      ctx,
      bookmarkIcon,
      { x: screen.x + screen.w - 38 * s, y: actionsY + 0 * s, w: 29 * s, h: 29 * s },
      "#111"
    );
  }

  const counts = instagramEngagementCounts(engagementPreset, engagementSeed);
  ctx.fillStyle = "#2b2b2b";
  ctx.font = `700 ${12.5 * s}px ${FONT_STACK}`;

  const metrics = [counts.likes, counts.comments, counts.sends];
  const iconWidths = [29 * s, 28 * s, 29 * s];
  const iconToTextGap = 4 * s;
  const defaultGroupGap = 16 * s;
  const minGroupGap = 8 * s;
  const contentWidthNoGroupGap = metrics.reduce((sum, label, index) => {
    return sum + iconWidths[index] + iconToTextGap + ctx.measureText(label).width;
  }, 0);
  const metricsStartX = screen.x + 8 * s;
  const bookmarkLeftX = screen.x + screen.w - 38 * s;
  const availableWidth = bookmarkLeftX - metricsStartX - 10 * s;
  const computedGroupGap =
    metrics.length > 1
      ? Math.max(
          minGroupGap,
          Math.min(
            defaultGroupGap,
            (availableWidth - contentWidthNoGroupGap) / (metrics.length - 1)
          )
        )
      : defaultGroupGap;

  let cursorX = metricsStartX;
  const countBaselineY = actionsY + 19 * s;

  const drawMetric = (
    icon: HTMLImageElement | null,
    iconRect: { w: number; h: number; y: number },
    label: string
  ) => {
    if (icon) {
      drawTintedImage(
        ctx,
        icon,
        {
          x: cursorX,
          y: actionsY + iconRect.y,
          w: iconRect.w,
          h: iconRect.h,
        },
        "#111"
      );
    }
    const textX = cursorX + iconRect.w + iconToTextGap;
    ctx.fillText(label, textX, countBaselineY);
    cursorX = textX + ctx.measureText(label).width + computedGroupGap;
  };

  drawMetric(heartIcon, { w: 29 * s, h: 29 * s, y: 0 * s }, counts.likes);
  drawMetric(commentIcon, { w: 28 * s, h: 28 * s, y: 0 * s }, counts.comments);
  drawMetric(sendIcon, { w: 29 * s, h: 29 * s, y: -1 * s }, counts.sends);

  const captionY = actionsY + actionsH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, captionY, screen.w, captionH);

  drawCaptionBlock(ctx, {
    x: screen.x + 14 * s,
    y: captionY + captionTopPadding,
    maxWidth: screen.w - 28 * s,
    lineHeight: captionLineHeight,
    username: safeName,
    body: captionBody,
    scale: s,
  });

  const navY = screen.y + screen.h - navH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, navY, screen.w, navH);
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(screen.x, navY, screen.w, 1 * s);

  const navIcons = [navHome, navReels, navSend, navSearch, navProfile];
  const navStep = screen.w / navIcons.length;
  navIcons.forEach((icon, index) => {
    if (!icon) return;
    drawTintedImage(
      ctx,
      icon,
      {
        x: screen.x + navStep * index + (navStep - 24 * s) / 2,
        y: navY + (navH - 64 * s) / 2,
        w: 28 * s,
        h: 28 * s,
      },
      index === 0 ? "#111111" : "#1f1f1f"
    );
  });

  endClip(ctx);
}

async function drawFacebookFeedSurface(args: DrawFeedSurfaceArgs) {
  const {
    ctx,
    layout,
    mediaAspect,
    primaryText,
    facebookPageName,
    headline,
    url,
    cta,
    clientName,
    clientVerified,
    clientAvatarUrl,
    loadImageFromUrl,
  } = args;

  const s = layout.scale;
  const screen = layout.screen;
  const [fbLikeIcon, fbCommentIcon, fbShareIcon, fbHomeIcon, fbReelsIcon, fbFriendsIcon, fbMarketplaceIcon, fbNotificationIcon] = await Promise.all([
    loadImageFromUrl("/images/fb_like.svg"),
    loadImageFromUrl("/images/fb_comment.svg"),
    loadImageFromUrl("/images/fb_share.svg"),
    loadImageFromUrl("/images/fb_home_active.svg"),
    loadImageFromUrl("/images/fb_reels.svg"),
    loadImageFromUrl("/images/fb_friends.svg"),
    loadImageFromUrl("/images/fb_marketplace.svg"),
    loadImageFromUrl("/images/fb_notification.svg"),
  ]);

  clipScreen(ctx, layout);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
  drawFeedStatusBar(ctx, layout, "auto");

  const cardX = screen.x;
  const cardW = screen.w;
  let y = screen.y + 40 * s;
  const headerH = 56 * s;

  await drawAvatarCircle(
    ctx,
    cardX + 24 * s,
    y + 33 * s,
    18 * s,
    clientName,
    clientAvatarUrl,
    loadImageFromUrl
  );

  const displayName = fitText((facebookPageName || clientName || " ").trim(), 26);
  const nameX = cardX + 49 * s;
  const nameY = y + 32 * s;
  ctx.fillStyle = "#1d2129";
  ctx.font = `600 ${14.5 * s}px ${FONT_STACK}`;
  ctx.fillText(displayName, nameX, nameY);

  if (clientVerified) {
    const nameW = ctx.measureText(displayName).width;
    drawVerifiedBadge(ctx, nameX + nameW + 4 * s, nameY - 8 * s, 8.2 * s);
  }

  ctx.fillStyle = "#65676b";
  ctx.font = `500 ${11.5 * s}px ${FONT_STACK}`;
  ctx.fillText("Sponsored ·", nameX, y + 47 * s);
  ctx.beginPath();
  ctx.arc(nameX + 72 * s, y + 43 * s, 3 * s, 0, Math.PI * 2);
  ctx.strokeStyle = "#65676b";
  ctx.lineWidth = Math.max(1, 2.2 * s);
  ctx.stroke();

  drawMoreIcon(ctx, cardX + cardW - 33 * s, y + 16 * s, 1.6 * s, "#8a8d91");
  ctx.fillStyle = "#8a8d91";
  ctx.font = `500 ${15 * s}px ${FONT_STACK}`;
  ctx.fillText("×", cardX + cardW - 15 * s, y + 18 * s);

  y += headerH;

  const bodyCopy = primaryText.trim();
  if (bodyCopy) {
    ctx.fillStyle = "#1d2129";
    ctx.font = `500 ${14 * s}px ${FONT_STACK}`;
    const bodyLineHeight = 18 * s;
    const bodyLines = drawUntruncatedWrappedText(
      ctx,
      bodyCopy,
      cardX + 10 * s,
      y + 16 * s,
      cardW - 20 * s,
      bodyLineHeight,
      true
    );
    y += bodyLines * bodyLineHeight + 10 * s;
  } else {
    y += 8 * s;
  }

  const fbNavH = 68 * s;
  const mediaH = mediaHeightForAspect(cardW, mediaAspect);
  const mediaRect = { x: cardX, y, w: cardW, h: mediaH };

  await drawFeedMedia(args, mediaRect, "Drop media");



  y += mediaH;

  const buttonText = fitText((cta || "Get quote").trim() || "Get quote", 18);
  ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
  const btnW = Math.max(76 * s, ctx.measureText(buttonText).width + 16 * s);
  const headlineText = (headline || displayName).trim() || displayName;
  const headlineX = cardX + 8 * s;
  const headlineTop = y + 40 * s;
  const headlineLineHeight = 16 * s;
  const headlineMaxWidth = Math.max(80 * s, cardW - btnW - 26 * s);
  ctx.font = `700 ${14 * s}px ${FONT_STACK}`;
  const headlineLines = Math.max(1, wrappedLineCount(ctx, headlineText, headlineMaxWidth));
  const headlineBottom = headlineTop + (headlineLines - 1) * headlineLineHeight + 3 * s;
  const ctaH = Math.max(56 * s, headlineBottom - y + 11 * s);
  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(cardX, y, cardW, ctaH);

  ctx.fillStyle = "#65676b";
  ctx.font = `600 ${11 * s}px ${FONT_STACK}`;
  const domain = fitText(facebookDomainLabel(url, displayName), 34);
  ctx.fillText(domain, cardX + 8 * s, y + 20 * s);

  ctx.fillStyle = "#1d2129";
  ctx.font = `700 ${14 * s}px ${FONT_STACK}`;
  drawUntruncatedWrappedText(ctx, headlineText, headlineX, headlineTop, headlineMaxWidth, headlineLineHeight);

  const btnH = 32 * s;
  const btnX = cardX + cardW - btnW - 8 * s;
  const btnY = y + (ctaH - btnH) / 2;
  ctx.fillStyle = "#dfe1e5";
  fillRoundedRect(ctx, { x: btnX, y: btnY, w: btnW, h: btnH }, 6 * s);

  ctx.fillStyle = "#34363a";
  ctx.textAlign = "center";
  ctx.fillText(buttonText, btnX + btnW / 2, btnY + 20 * s);
  ctx.textAlign = "left";

  y += ctaH;

  ctx.fillStyle = "#ffffff";
  const reactionsH = 36 * s;
  ctx.fillRect(cardX, y, cardW, reactionsH);
  ctx.fillStyle = "#65676b";
  ctx.font = `500 ${14 * s}px ${FONT_STACK}`;
  ctx.fillText("8.6K", cardX + 23 * s, y + 24 * s);
  ctx.textAlign = "right";
  ctx.fillText("3.7K comments · 588 shares", cardX + cardW - 8 * s, y + 24 * s);
  ctx.textAlign = "left";
  ctx.fillStyle = "#2f73ff";
  ctx.beginPath();
  ctx.arc(cardX + 10 * s, y + 18 * s, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  y += reactionsH;

  ctx.fillStyle = "#f2f3f5";
  ctx.fillRect(cardX, y, cardW, 1 * s);
  y += 1 * s;

  const actionsH = 34 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cardX, y, cardW, actionsH);
  ctx.font = `600 ${12 * s}px ${FONT_STACK}`;
  const buttonLabels = ["Like", "Comment", "Share"];
  const buttonIcons = [fbLikeIcon, fbCommentIcon, fbShareIcon];
  const buttonTextColor = "#65676b";
  const buttonStep = cardW / 3;
  const iconSize = 14 * s;
  const iconGap = 5 * s;

  buttonLabels.forEach((label, index) => {
    const slotCenterX = cardX + buttonStep * index + buttonStep / 2;
    const labelWidth = ctx.measureText(label).width;
    const contentWidth = iconSize + iconGap + labelWidth;
    const contentX = slotCenterX - contentWidth / 2;
    const icon = buttonIcons[index];
    if (icon) {
      drawTintedImage(
        ctx,
        icon,
        { x: contentX, y: y + (actionsH - iconSize) / 2, w: iconSize, h: iconSize },
        buttonTextColor
      );
    }
    ctx.fillStyle = buttonTextColor;
    ctx.fillText(label, contentX + iconSize + iconGap, y + 22 * s);
  });

  y += actionsH;
  ctx.fillStyle = "#f2f3f5";
  ctx.fillRect(cardX, y, cardW, 1 * s);

  const navY = screen.y + screen.h - fbNavH;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cardX, navY - 20, cardW, fbNavH + 3);
  ctx.fillStyle = "#d9dde3";
  ctx.fillRect(cardX, navY - 20, cardW, 1 * s);

  const navItems = [
    { icon: fbHomeIcon, label: "Home", active: true },
    { icon: fbReelsIcon, label: "Reels", active: false },
    { icon: fbFriendsIcon, label: "Friends", active: false },
    { icon: fbMarketplaceIcon, label: "Marketplace", active: false },
    { icon: fbNotificationIcon, label: "Notifications", active: false },
  ];
  const navStep = cardW / navItems.length;
  const navIconSize = 22 * s;
  navItems.forEach((item, index) => {
    const centerX = cardX + navStep * index + navStep / 2;
    const iconY = navY + 0 * s;
    if (item.icon) {
      drawTintedImage(
        ctx,
        item.icon,
        { x: centerX - navIconSize / 2, y: iconY, w: navIconSize, h: navIconSize },
        item.active ? "#1877f2" : "#1f2328"
      );
    }

    ctx.fillStyle = item.active ? "#1877f2" : "#1f2328";
    ctx.font = `${item.active ? 700 : 600} ${9.2 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(item.label, centerX, navY + fbNavH - 32 * s);
  });
  ctx.textAlign = "left";

  endClip(ctx);
}

export async function drawFeedSurface(args: DrawFeedSurfaceArgs) {
  const key = args.platform.toLowerCase();
  if (key.includes("facebook")) {
    await drawFacebookFeedSurface(args);
    return;
  }

  await drawInstagramFeedSurface(args);
}
