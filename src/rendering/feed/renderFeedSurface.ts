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
  drawWrappedText,
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
    lineHeight,
    username,
    body,
    scale,
  }: {
    x: number;
    y: number;
    maxWidth: number;
    maxLines: number;
    lineHeight: number;
    username: string;
    body: string;
    scale: number;
  }
) {
  const name = fitText(username || "brand", 22);
  const text = body.trim();
  if (!text) {
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
    ctx.fillText(name, x, y);
    return;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const lines: Array<{ includeName: boolean; text: string }> = [];
  let wordIndex = 0;
  let isFirstLine = true;

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

  while (lines.length < maxLines && wordIndex < words.length) {
    let candidate = "";
    let consumed = 0;

    for (let i = wordIndex; i < words.length; i += 1) {
      const next = candidate ? `${candidate} ${words[i]}` : words[i];
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

  if (wordIndex < words.length && lines.length > 0) {
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

  y += 55 * s;
  ctx.fillStyle = "#efefef";
  ctx.fillRect(screen.x, y, screen.w, 1 * s);

  const adHeaderY = y + 6 * s;
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
  const captionH = 58 * s;
  const mediaMaxH = Math.max(130 * s, screen.y + screen.h - navH - ctaH - actionsH - captionH - mediaY);
  const mediaTargetH = mediaHeightForAspect(screen.w, mediaAspect);
  const mediaH = Math.min(mediaTargetH, mediaMaxH);
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

  if (heartIcon) {
    drawTintedImage(ctx, heartIcon, { x: screen.x + 8 * s, y: actionsY + 0 * s, w: 29 * s, h: 29 * s }, "#111");
  }
  if (commentIcon) {
    drawTintedImage(ctx, commentIcon, { x: screen.x + 63 * s, y: actionsY + 0 * s, w: 28 * s, h: 28 * s }, "#111");
  }
  if (sendIcon) {
    drawTintedImage(ctx, sendIcon, { x: screen.x + 110 * s, y: actionsY - 1 * s, w: 29 * s, h: 29 * s }, "#111");
  }
  if (bookmarkIcon) {
    drawTintedImage(
      ctx,
      bookmarkIcon,
      { x: screen.x + screen.w - 38 * s, y: actionsY + 0 * s, w: 29 * s, h: 29 * s },
      "#111"
    );
  }

  ctx.fillStyle = "#2b2b2b";
  ctx.font = `700 ${12.5 * s}px ${FONT_STACK}`;
  ctx.fillText("86", screen.x + 38 * s, actionsY + 19 * s);
  ctx.fillText("11", screen.x + 92 * s, actionsY + 19 * s);
  ctx.fillText("3", screen.x + 141 * s, actionsY + 19 * s);

  const captionY = actionsY + actionsH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, captionY, screen.w, captionH);

  drawCaptionBlock(ctx, {
    x: screen.x + 14 * s,
    y: captionY + 8 * s,
    maxWidth: screen.w - 28 * s,
    maxLines: 3,
    lineHeight: 15 * s,
    username: safeName,
    body: primaryText || "Write some post copy.",
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

function drawFacebookTopBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, s: number) {
  const topH = 46 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, topH);

  ctx.fillStyle = "#1877f2";
  ctx.font = `700 ${14 * s}px ${FONT_STACK}`;
  ctx.fillText("facebook", x + 14 * s, y + 29 * s);

  const iconY = y + topH / 2;
  const iconSize = 14 * s;
  for (let i = 0; i < 3; i += 1) {
    const cx = x + w - (19 + i * 22) * s;
    ctx.fillStyle = "#f0f2f5";
    ctx.beginPath();
    ctx.arc(cx, iconY, 9 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#202124";
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    if (i === 0) {
      ctx.moveTo(cx - iconSize * 0.2, iconY);
      ctx.lineTo(cx + iconSize * 0.2, iconY);
      ctx.moveTo(cx, iconY - iconSize * 0.2);
      ctx.lineTo(cx, iconY + iconSize * 0.2);
    } else if (i === 1) {
      ctx.arc(cx - 1 * s, iconY - 1 * s, 3.2 * s, 0, Math.PI * 2);
      ctx.moveTo(cx + 3 * s, iconY + 3 * s);
      ctx.lineTo(cx + 6 * s, iconY + 6 * s);
    } else {
      fillRoundedRect(ctx, { x: cx - 5 * s, y: iconY - 3.8 * s, w: 10 * s, h: 8 * s }, 2 * s);
      ctx.fillStyle = "#f0f2f5";
      ctx.beginPath();
      ctx.moveTo(cx - 1 * s, iconY + 4 * s);
      ctx.lineTo(cx + 2 * s, iconY + 3 * s);
      ctx.lineTo(cx + 0 * s, iconY + 1 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#202124";
      ctx.beginPath();
      ctx.rect(cx - 4 * s, iconY - 2.6 * s, 8 * s, 5.2 * s);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(x, y + topH - 1 * s, w, 1 * s);
}

function drawFacebookTabBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, s: number) {
  const tabH = 34 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, tabH);

  const labels = ["Home", "Reels", "Friends", "Groups", "Notifs"];
  const step = w / labels.length;
  labels.forEach((label, i) => {
    const cx = x + step * (i + 0.5);
    const active = i === 0;
    ctx.fillStyle = active ? "#1877f2" : "#65676b";
    ctx.font = `${active ? 700 : 500} ${7.2 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, y + 22 * s);
    if (active) {
      ctx.fillRect(cx - 16 * s, y + tabH - 2 * s, 32 * s, 2 * s);
    }
  });
  ctx.textAlign = "left";

  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(x, y + tabH - 1 * s, w, 1 * s);
}

function drawFacebookBottomNav(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(x, y, w, 1 * s);

  const step = w / 5;
  for (let i = 0; i < 5; i += 1) {
    const cx = x + step * (i + 0.5);
    ctx.fillStyle = i === 0 ? "#1877f2" : "#65676b";
    ctx.beginPath();
    ctx.arc(cx, y + h / 2, 6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function drawFacebookFeedSurface(args: DrawFeedSurfaceArgs) {
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
    loadImageFromUrl,
  } = args;

  const s = layout.scale;
  const screen = layout.screen;
  const navH = 44 * s;

  clipScreen(ctx, layout);

  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);

  drawFacebookTopBar(ctx, screen.x, screen.y, screen.w, s);
  drawFacebookTabBar(ctx, screen.x, screen.y + 46 * s, screen.w, s);

  const cardX = screen.x + 8 * s;
  const cardW = screen.w - 16 * s;
  const contentTop = screen.y + 86 * s;

  ctx.fillStyle = "#ffffff";
  fillRoundedRect(
    ctx,
    {
      x: cardX,
      y: contentTop,
      w: cardW,
      h: screen.h - (contentTop - screen.y) - navH - 10 * s,
    },
    7 * s
  );

  const headerY = contentTop + 14 * s;
  await drawAvatarCircle(
    ctx,
    cardX + 16 * s,
    headerY + 10 * s,
    10 * s,
    clientName,
    clientAvatarUrl,
    loadImageFromUrl
  );

  const displayName = fitText(clientName || "Brand", 24);
  const nameX = cardX + 32 * s;
  const nameY = headerY + 8 * s;
  ctx.fillStyle = "#1d2129";
  ctx.font = `700 ${8.4 * s}px ${FONT_STACK}`;
  ctx.fillText(displayName, nameX, nameY);

  if (clientVerified) {
    const nameW = ctx.measureText(displayName).width;
    drawVerifiedBadge(ctx, nameX + nameW + 3 * s, nameY - 6.5 * s, 7 * s);
  }

  ctx.fillStyle = "#65676b";
  ctx.font = `500 ${7 * s}px ${FONT_STACK}`;
  ctx.fillText("Sponsored · Public", nameX, headerY + 18 * s);

  drawMoreIcon(ctx, cardX + cardW - 20 * s, headerY + 10 * s, 1.5 * s, "#8a8d91");

  let y = headerY + 28 * s;

  if (primaryText.trim()) {
    ctx.fillStyle = "#1d2129";
    ctx.font = `500 ${8 * s}px ${FONT_STACK}`;
    drawWrappedText(ctx, primaryText, cardX + 8 * s, y, cardW - 16 * s, 3, 12 * s);
    y += 38 * s;
  }

  const footerH = navH + 80 * s;
  const mediaMaxH = Math.max(120 * s, screen.y + screen.h - footerH - y - 4 * s);
  const mediaTargetH = mediaHeightForAspect(cardW, mediaAspect);
  const mediaH = Math.min(mediaMaxH, mediaTargetH);
  const mediaRect = { x: cardX, y, w: cardW, h: mediaH };

  await drawFeedMedia(args, mediaRect, "Drop media");

  y += mediaH;

  const ctaH = 42 * s;
  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(cardX, y, cardW, ctaH);

  ctx.fillStyle = "#65676b";
  ctx.font = `600 ${6.4 * s}px ${FONT_STACK}`;
  const domain = `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand"}.com`;
  ctx.fillText(domain, cardX + 8 * s, y + 14 * s);

  ctx.fillStyle = "#1d2129";
  ctx.font = `700 ${7.6 * s}px ${FONT_STACK}`;
  ctx.fillText(fitText(primaryText || displayName, 34), cardX + 8 * s, y + 27 * s);

  const btnW = Math.max(72 * s, ctx.measureText(cta || "Learn More").width + 20 * s);
  const btnH = 18 * s;
  const btnX = cardX + cardW - btnW - 8 * s;
  const btnY = y + (ctaH - btnH) / 2;
  ctx.fillStyle = ctaBgColor;
  fillRoundedRect(ctx, { x: btnX, y: btnY, w: btnW, h: btnH }, 5 * s);

  ctx.fillStyle = ctaTextColor;
  ctx.font = `700 ${7.2 * s}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(fitText(cta || "Learn More", 14), btnX + btnW / 2, btnY + 9 * s);
  ctx.textAlign = "left";

  y += ctaH;

  ctx.fillStyle = "#65676b";
  ctx.font = `500 ${7 * s}px ${FONT_STACK}`;
  ctx.fillText("👍 2.1K   ·   48 comments", cardX + 8 * s, y + 15 * s);

  y += 22 * s;

  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(cardX + 8 * s, y, cardW - 16 * s, 1 * s);
  y += 1 * s;

  const actionLabels = ["Like", "Comment", "Share"];
  const actionStep = cardW / actionLabels.length;
  actionLabels.forEach((label, index) => {
    const left = cardX + actionStep * index;
    ctx.fillStyle = "#1d2129";
    ctx.font = `600 ${7.4 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(label, left + actionStep / 2, y + 16 * s);
  });
  ctx.textAlign = "left";

  drawFacebookBottomNav(ctx, screen.x, screen.y + screen.h - navH, screen.w, navH, s);

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
